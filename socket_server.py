"""
Standalone WebSocket server for live attendee-count updates — built directly
on Python's socket module (no websockets/http.server library doing the
socket work for us).

Runs as its own Python process, separate from the Flask app. Browser/mobile
clients open a TCP connection here, complete the WebSocket handshake, and
"subscribe" to a meeting id; the Flask app notifies this server over a
second raw TCP socket whenever someone joins/leaves a meeting, and this
server broadcasts that update to every client subscribed to that meeting's
room.

built with tcp socket: >> python socket_server.py

# Сокет — соединение, которое не закрывается, поэтому сервер сам может
# отправить браузеру обновление в любой момент.
"""
import socket
import threading
import base64
import hashlib
import struct
import json

WS_PORT = 8765          # сюда подключаются браузеры (сам вебсокет)
BROADCAST_HTTP_PORT = 8766  # сюда Flask стучится, чтобы запустить рассылку

# RFC 6455: fixed GUID used to compute the WebSocket handshake response
WS_HANDSHAKE_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

# meeting_id -> set of raw client sockets subscribed to that meeting
rooms = {}
rooms_lock = threading.Lock()


def _recv_until_headers_end(conn):
    """Read raw bytes off the socket until the blank line that ends HTTP headers."""
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(4096)
        if not chunk:
            return data
        data += chunk
    return data


def _ws_handshake(conn, request_bytes):
    """Read the client's Sec-WebSocket-Key and reply with the RFC 6455
    Sec-WebSocket-Accept header, upgrading the raw TCP socket to WebSocket."""
    headers = request_bytes.decode("utf-8", errors="ignore")
    key = None
    for line in headers.split("\r\n"):
        if line.lower().startswith("sec-websocket-key:"):
            key = line.split(":", 1)[1].strip()
    if not key:
        return False
    accept = base64.b64encode(
        hashlib.sha1((key + WS_HANDSHAKE_GUID).encode()).digest()
    ).decode()
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
    )
    conn.sendall(response.encode())
    return True


def _recv_exact(conn, length):
    buf = b""
    while len(buf) < length:
        chunk = conn.recv(length - len(buf))
        if not chunk:
            return None
        buf += chunk
    return buf


def _decode_ws_frame(conn):
    """Read one WebSocket text frame from the socket and return its payload
    as a string, or None if the connection closed/sent a close frame."""
    header = _recv_exact(conn, 2)
    if not header:
        return None
    b1, b2 = header[0], header[1]
    opcode = b1 & 0x0F
    if opcode == 0x8:  # close frame
        return None
    masked = b2 & 0x80
    length = b2 & 0x7F
    if length == 126:
        ext = _recv_exact(conn, 2)
        length = struct.unpack(">H", ext)[0]
    elif length == 127:
        ext = _recv_exact(conn, 8)
        length = struct.unpack(">Q", ext)[0]
    mask_bytes = _recv_exact(conn, 4) if masked else b""
    payload = _recv_exact(conn, length)
    if payload is None:
        return None
    if masked:
        payload = bytes(payload[i] ^ mask_bytes[i % 4] for i in range(len(payload)))
    return payload.decode("utf-8", errors="ignore")


def _encode_ws_frame(message):
    """Build a server->client WebSocket text frame (unmasked, as the spec allows)."""
    payload = message.encode("utf-8")
    length = len(payload)
    if length <= 125:
        header = bytes([0x81, length])
    elif length <= 65535:
        header = bytes([0x81, 126]) + struct.pack(">H", length)
    else:
        header = bytes([0x81, 127]) + struct.pack(">Q", length)
    return header + payload


def register(conn, meeting_id):
    with rooms_lock:
        rooms.setdefault(meeting_id, set()).add(conn)


def unregister(conn):
    with rooms_lock:
        for subscribers in rooms.values():
            subscribers.discard(conn)


def broadcast(meeting_id, payload):
    """Send payload (dict) to every raw socket subscribed to meeting_id."""
    meeting_id = str(meeting_id)
    with rooms_lock:
        subscribers = list(rooms.get(meeting_id, ()))
    if not subscribers:
        return
    frame = _encode_ws_frame(json.dumps(payload))
    for conn in subscribers:
        try:
            conn.sendall(frame)
        except OSError:
            unregister(conn)


def handle_client(conn, addr):
    """One thread per connected client: do the handshake, then loop reading
    subscribe messages off the raw socket until it closes."""
    try:
        request = _recv_until_headers_end(conn)
        if not _ws_handshake(conn, request):
            return
        while True:
            raw = _decode_ws_frame(conn)
            if raw is None:
                break
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("action") == "subscribe":
                register(conn, str(msg.get("meeting_id")))
    except (ConnectionResetError, OSError):
        pass
    finally:
        unregister(conn)
        conn.close()


def run_ws_server():
    """Open the raw TCP listening socket browsers connect to (port 8765)."""
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("0.0.0.0", WS_PORT))
    server.listen()
    print(f"WebSocket server listening on ws://0.0.0.0:{WS_PORT}")
    while True:
        conn, addr = server.accept()
        threading.Thread(target=handle_client, args=(conn, addr), daemon=True).start()


def handle_broadcast_request(conn):
    """Handle one POST /broadcast request on the internal trigger socket."""
    try:
        request = _recv_until_headers_end(conn)
        header_part, _, body = request.partition(b"\r\n\r\n")
        content_length = 0
        for line in header_part.decode("utf-8", errors="ignore").split("\r\n"):
            if line.lower().startswith("content-length:"):
                content_length = int(line.split(":", 1)[1].strip())
        remaining = content_length - len(body)
        if remaining > 0:
            more = _recv_exact(conn, remaining)
            body += more or b""

        try:
            data = json.loads(body.decode("utf-8"))
            meeting_id = data["meeting_id"]
        except (json.JSONDecodeError, KeyError):
            conn.sendall(b"HTTP/1.1 400 Bad Request\r\n\r\n")
            return

        broadcast(meeting_id, data)
        conn.sendall(b"HTTP/1.1 204 No Content\r\n\r\n")
    except OSError:
        pass
    finally:
        conn.close()


def run_broadcast_trigger_server():
    """Open the second raw TCP socket Flask POSTs to (port 8766)."""
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", BROADCAST_HTTP_PORT))
    server.listen()
    print(f"Broadcast trigger endpoint on http://127.0.0.1:{BROADCAST_HTTP_PORT}/broadcast")
    while True:
        conn, addr = server.accept()
        threading.Thread(target=handle_broadcast_request, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    threading.Thread(target=run_broadcast_trigger_server, daemon=True).start()
    run_ws_server()
