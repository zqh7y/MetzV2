"""Own profile, viewing other users, trust toggle, and user search — mirrors
screens/profile.py from the web app."""

from flask import Blueprint, request, jsonify

from data import (
    get_user, is_admin, is_trusted, set_trusted, get_account_status,
    get_all_meetings, search_users, generate_user_color, update_profile,
    PROFILE_EMOJIS, MAX_DISPLAY_NAME, MAX_BIO,
)

from helpers import current_uid, require_admin

profile_bp = Blueprint("profile", __name__)


@profile_bp.route("/api/profile")
def profile():
    uid = current_uid()
    user = get_user(uid)
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    return jsonify({
        "uid": uid,
        "email": user["email"],
        "username": user["username"],
        # The three editable fields, plus the limits the editor needs so the
        # client never has to hard-code rules the server actually enforces.
        "display_name": user.get("display_name") or "",
        "bio": user.get("bio") or "",
        "avatar_emoji": user.get("avatar_emoji") or "",
        "emoji_choices": PROFILE_EMOJIS,
        "max_display_name": MAX_DISPLAY_NAME,
        "max_bio": MAX_BIO,
        "profile_picture": user.get("profile_picture"),
        "profile_color": generate_user_color(uid),
        "is_admin": is_admin(uid),
        "is_trusted": is_trusted(uid),
        "meetings_created": len(user.get("created_meeting_ids", [])),
        "meetings_joined": len(user.get("joined_meeting_ids", [])),
        "meetings_swiped": len(user.get("swiped_ids", [])),
        "account_status": get_account_status(uid),
        "pending_review_count": len(get_all_meetings(status="pending")) if is_admin(uid) else 0,
    })


@profile_bp.route("/api/profile", methods=["POST"])
def edit_profile():
    """Update the parts of a profile the owner is allowed to change.

    Mirrors the web's edit_profile_route: capping, escaping and the emoji
    whitelist all live in data.update_profile(), so both clients get the same
    rules rather than each re-implementing validation.
    """
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(force=True) or {}

    # Only fields actually present are touched, so a client sending just a bio
    # doesn't silently blank the display name.
    if not update_profile(
        uid,
        display_name=body.get("display_name"),
        bio=body.get("bio"),
        avatar_emoji=body.get("avatar_emoji"),
    ):
        return jsonify({"error": "not found"}), 404

    user = get_user(uid)
    return jsonify({
        "display_name": user.get("display_name") or "",
        "bio": user.get("bio") or "",
        "avatar_emoji": user.get("avatar_emoji") or "",
    })


@profile_bp.route("/api/users/<uid>")
def user_profile(uid):
    user = get_user(uid)
    if not user:
        return jsonify({"error": "not found"}), 404
    return jsonify({
        "uid": uid,
        "username": user["username"],
        "profile_picture": user.get("profile_picture"),
        "profile_color": generate_user_color(uid),
        "is_trusted": is_trusted(uid),
        "is_admin": is_admin(uid),
        "meetings_created": len(user.get("created_meeting_ids", [])),
        "meetings_joined": len(user.get("joined_meeting_ids", [])),
        "meetings_swiped": len(user.get("swiped_ids", [])),
        "joined_at": user.get("joined_at"),
        "last_online": user.get("last_online"),
        "account_status": get_account_status(uid),
    })


@profile_bp.route("/api/users/<uid>/trust", methods=["POST"])
def trust_user(uid):
    forbidden = require_admin()
    if forbidden:
        return forbidden
    set_trusted(uid, not is_trusted(uid), current_uid())
    return jsonify({"uid": uid, "is_trusted": is_trusted(uid)})


@profile_bp.route("/api/search_users")
def search_users_route():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    return jsonify(search_users(q))
