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


def issue_token(uid, token_version=0, ttl_seconds=TOKEN_TTL_SECONDS):
    """Return a signed token identifying `uid` at a point in its session life.

    `token_version` is what makes logging out mean something. A token cannot be
    withdrawn once signed — that is the trade for having no session store — so
    instead it carries the version it was minted at, and the account holds the
    version it currently accepts. Bumping the account's version leaves every
    token ever issued for it unacceptable, which is the only way "log me out
    everywhere" can be true of a stolen phone.
    """
    expires_at = int(time.time()) + ttl_seconds
    payload = f"{uid}|{expires_at}|{int(token_version)}"
    return f"{_b64(payload.encode('utf-8'))}.{_sign(payload)}"


def verify_token(token):
    """Return (uid, token_version) for a valid token, or (None, None).

    The caller compares the version against the account's current one; that
    lookup lives with the data rather than here, so this module stays free of
    anything but the signing.

    Tokens minted before versioning have no third field and read as version 0,
    which is the version every account starts at. So existing sessions keep
    working, and the first logout moves the account past them for good.
    """
    if not token or "." not in token:
        return None, None
    encoded, signature = token.rsplit(".", 1)
    try:
        padding = "=" * (-len(encoded) % 4)
        payload = base64.urlsafe_b64decode(encoded + padding).decode("utf-8")
        parts = payload.split("|")
        if len(parts) == 2:
            uid, expires_at = parts
            version = 0
        else:
            # rsplit-style: a uid can in principle contain the separator, so
            # the two trailing fields are taken from the right.
            version = int(parts[-1])
            expires_at = parts[-2]
            uid = "|".join(parts[:-2])
        expires_at = int(expires_at)
    except (ValueError, UnicodeDecodeError):
        return None, None

    # compare_digest so a wrong signature can't be found byte by byte
    if not hmac.compare_digest(signature, _sign(payload)):
        return None, None
    if time.time() > expires_at:
        return None, None
    return uid, version
