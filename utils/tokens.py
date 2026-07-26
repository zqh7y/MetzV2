"""Signed session tokens for the mobile JSON API.

The API used to take the caller's identity straight from an `X-User-Id`
header, which meant anyone could act as any user — including an admin —
just by changing a string. These tokens fix that without adding a
dependency or a server-side session store: the server signs
`uid|expiry` with the app secret, and only a holder of that secret can
mint one. The token is opaque to the client and verified on every request.

This is not a replacement for verifying Firebase ID tokens; it is the
smallest correct thing that removes trivial impersonation. Verifying the
Firebase token signature (via firebase_admin) would additionally prove the
user authenticated recently, and is the natural next step.
"""

import base64
import hmac
import hashlib
import os
import time

TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60   # 30 days, matching the web session


def _secret():
    key = os.environ.get("FLASK_SECRET_KEY", "")
    if not key:
        raise RuntimeError("FLASK_SECRET_KEY must be set to issue API tokens")
    return key.encode("utf-8")


def _b64(raw):
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _sign(payload):
    return _b64(hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).digest())


def issue_token(uid, ttl_seconds=TOKEN_TTL_SECONDS):
    """Return a signed token identifying `uid`."""
    expires_at = int(time.time()) + ttl_seconds
    payload = f"{uid}|{expires_at}"
    return f"{_b64(payload.encode('utf-8'))}.{_sign(payload)}"


def verify_token(token):
    """Return the uid a token belongs to, or None if it is invalid/expired."""
    if not token or "." not in token:
        return None
    encoded, signature = token.rsplit(".", 1)
    try:
        padding = "=" * (-len(encoded) % 4)
        payload = base64.urlsafe_b64decode(encoded + padding).decode("utf-8")
        uid, expires_at = payload.rsplit("|", 1)
        expires_at = int(expires_at)
    except (ValueError, UnicodeDecodeError):
        return None

    # compare_digest so a wrong signature can't be found byte by byte
    if not hmac.compare_digest(signature, _sign(payload)):
        return None
    if time.time() > expires_at:
        return None
    return uid
