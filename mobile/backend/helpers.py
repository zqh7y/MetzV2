"""Shared helpers used by every route module: auth header reading, admin
guard, and the common meeting -> JSON shape. Kept separate so each route
module only imports what it needs."""

import os
from flask import request, jsonify

from data import is_admin, is_trusted, get_joined_users_preview, shorten_address, get_user
from utils.tokens import verify_token

FIREBASE_API_KEY = os.environ["FIREBASE_API_KEY"]  # same project as the web app

# In-memory store for signups awaiting email verification, keyed by email.
# (No server-side session/cookies here — the mobile client is stateless
# between requests, so this plays the same role session["pending_signup"]
# plays in the web app.)
PENDING_SIGNUPS = {}


# In development the old X-User-Id header still works so an existing dev
# build keeps running; in production only a signed token is accepted.
ALLOW_LEGACY_HEADER = os.environ.get("FLASK_ENV", "production").lower() == "development"


def current_uid():
    """Identify the caller from their signed token.

    The API previously trusted an `X-User-Id` header verbatim, so any client
    could impersonate any user (or an admin) by editing one string. Tokens are
    signed with the app secret and verified here on every request.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        uid = verify_token(auth_header[7:].strip())
        if uid:
            return uid
        return ""   # a supplied-but-invalid token is never a fallback

    if ALLOW_LEGACY_HEADER:
        return request.headers.get("X-User-Id", "")
    return ""


def require_admin():
    if not is_admin(current_uid()):
        return jsonify({"error": "forbidden"}), 403
    return None


def serialize_meeting(m, uid):
    d = m.to_dict()
    d["joined_preview"] = get_joined_users_preview(m.joined_uids)
    d["short_location"] = shorten_address(getattr(m, "location", None))
    d["creator_is_trusted"] = is_trusted(m.creator_uid) if m.creator_uid else False
    d["is_joined"] = uid in m.joined_uids
    d["can_delete"] = is_admin(uid) or uid == m.creator_uid
    # Joining or passing both mark a meeting as swiped, so "not seen" is what
    # the app's For You shelf offers — same rule the web home page uses.
    user = get_user(uid)
    d["is_seen"] = m.id in (user["swiped_ids"] if user else [])
    return d
