"""Admin moderation: reviewing, approving, and declining pending meetings —
mirrors screens/admin.py from the web app."""

from flask import Blueprint, jsonify

from data import (
    get_all_meetings, approve_meeting, decline_meeting,
    platform_stats, USERS_DB, generate_user_color, is_admin, is_trusted,
    is_banned, set_banned, set_trusted, delete_user, delete_meeting,
    display_name_for,
)

from helpers import current_uid, require_admin, serialize_meeting

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/api/admin/pending")
def admin_pending():
    forbidden = require_admin()
    if forbidden:
        return forbidden
    uid = current_uid()
    pending = get_all_meetings(status="pending")
    return jsonify([serialize_meeting(m, uid) for m in pending])


@admin_bp.route("/api/admin/meetings/<int:meeting_id>/approve", methods=["POST"])
def admin_approve(meeting_id):
    if approve_meeting(meeting_id, current_uid()):
        return jsonify({"status": "approved"})
    return jsonify({"error": "forbidden"}), 403


@admin_bp.route("/api/admin/meetings/<int:meeting_id>/decline", methods=["POST"])
def admin_decline(meeting_id):
    if decline_meeting(meeting_id, current_uid()):
        return jsonify({"status": "declined"})
    return jsonify({"error": "forbidden"}), 403


# ── Developer dashboard ──────────────────────────────────────────────────────
# The web's /admin/dashboard renders users, meetings and platform_stats() into
# one template. The app needs the same three things as JSON; the stats come
# from the identical helper so the two dashboards can't report different
# numbers for the same database.

@admin_bp.route("/api/admin/dashboard")
def admin_dashboard():
    forbidden = require_admin()
    if forbidden:
        return forbidden
    uid = current_uid()

    users = sorted(USERS_DB.values(), key=lambda u: u.get("joined_at", ""), reverse=True)
    meetings = sorted(get_all_meetings(), key=lambda m: m.id, reverse=True)

    return jsonify({
        "stats": platform_stats(),
        "users": [{
            "uid": u["uid"],
            "username": display_name_for(u["uid"]),
            "email": u.get("email", ""),
            "color": generate_user_color(u["uid"]),
            "initial": (display_name_for(u["uid"]) or u["uid"])[:1].upper(),
            "is_admin": is_admin(u["uid"]),
            "is_trusted": is_trusted(u["uid"]),
            "is_banned": is_banned(u["uid"]),
            "created": len(u.get("created_meeting_ids", [])),
            "joined": len(u.get("joined_meeting_ids", [])),
            "joined_at": u.get("joined_at"),
            "last_online": u.get("last_online"),
        } for u in users],
        "meetings": [serialize_meeting(m, uid) for m in meetings],
    })


@admin_bp.route("/api/admin/users/<target_uid>/ban", methods=["POST"])
def admin_ban(target_uid):
    forbidden = require_admin()
    if forbidden:
        return forbidden
    banned = not is_banned(target_uid)
    if set_banned(target_uid, banned, current_uid()):
        return jsonify({"status": "banned" if banned else "unbanned", "is_banned": banned})
    return jsonify({"error": "forbidden"}), 403


@admin_bp.route("/api/admin/users/<target_uid>/trust", methods=["POST"])
def admin_set_trust(target_uid):
    forbidden = require_admin()
    if forbidden:
        return forbidden
    new_state = not is_trusted(target_uid)
    if set_trusted(target_uid, new_state, current_uid()):
        return jsonify({"is_trusted": new_state})
    return jsonify({"error": "forbidden"}), 403


@admin_bp.route("/api/admin/users/<target_uid>", methods=["DELETE"])
def admin_delete_user(target_uid):
    forbidden = require_admin()
    if forbidden:
        return forbidden
    if delete_user(target_uid, current_uid()):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "forbidden"}), 403


@admin_bp.route("/api/admin/meetings/<int:meeting_id>", methods=["DELETE"])
def admin_delete_meeting(meeting_id):
    forbidden = require_admin()
    if forbidden:
        return forbidden
    if delete_meeting(meeting_id, current_uid()):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "forbidden"}), 403
