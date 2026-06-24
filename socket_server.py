"""
Standalone WebSocket server for live attendee-count updates.

Runs as its own Python process, separate from the Flask app. Browser/mobile
clients open a WebSocket connection here and "subscribe" to a meeting id; the
Flask app notifies this server over a tiny local HTTP endpoint whenever
someone joins/leaves a meeting, and this server broadcasts that update to
every client subscribed to that meeting's room.

built with tcp socket: >> python socket_server.py

# Сокет — соединение, которое не закрывается, поэтому сервер сам может
# отправить браузеру обновление в любой момент.
"""
import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import websockets

WS_PORT = 8765          # сюда подключаются браузеры (сам вебсокет)
BROADCAST_HTTP_PORT = 8766  # сюда Flask стучится, чтобы запустить рассылку

# meeting_id -> set websocket-соединений, подписанных на эту встречу
rooms = {}
rooms_lock = threading.Lock()

main_loop = None  # the asyncio event loop running the websocket server


async def register(ws, meeting_id):
    # подписать соединение на встречу
    with rooms_lock:
        rooms.setdefault(meeting_id, set()).add(ws)


async def unregister(ws):
    # отписать соединение (вкладка закрыта)
    with rooms_lock:
        for subscribers in rooms.values():
            subscribers.discard(ws)


async def handle_client(ws):
    """One coroutine per connected client. Listens for subscribe messages."""
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if msg.get("action") == "subscribe":
                meeting_id = str(msg.get("meeting_id"))
                await register(ws, meeting_id)
    finally:
        await unregister(ws)


async def broadcast(meeting_id, payload):
    """Send payload (dict) to every client subscribed to meeting_id."""
    # разослать всем подписчикам этой встречи
    meeting_id = str(meeting_id)
    with rooms_lock:
        subscribers = list(rooms.get(meeting_id, ()))
    if not subscribers:
        return
    message = json.dumps(payload)
    await asyncio.gather(
        *(ws.send(message) for ws in subscribers),
        return_exceptions=True,
    )


class BroadcastHandler(BaseHTTPRequestHandler):
    """Tiny HTTP server Flask calls into so it can trigger a broadcast."""
    # Flask и сокет-сервер — разные процессы, поэтому Flask шлёт обычный POST сюда

    def do_POST(self):
        if self.path != "/broadcast":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
            meeting_id = data["meeting_id"]
        except (json.JSONDecodeError, KeyError):
            self.send_response(400)
            self.end_headers()
            return

        if main_loop:
            asyncio.run_coroutine_threadsafe(
                broadcast(meeting_id, data), main_loop
            )

        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


def run_http_trigger_server():
    server = HTTPServer(("127.0.0.1", BROADCAST_HTTP_PORT), BroadcastHandler)
    server.serve_forever()


async def main():
    global main_loop
    main_loop = asyncio.get_running_loop()

    threading.Thread(target=run_http_trigger_server, daemon=True).start()

    # сам WebSocket-сервер — держит порт 8765 открытым
    async with websockets.serve(handle_client, "0.0.0.0", WS_PORT):
        print(f"WebSocket server listening on ws://0.0.0.0:{WS_PORT}")
        print(f"Broadcast trigger endpoint on http://127.0.0.1:{BROADCAST_HTTP_PORT}/broadcast")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
