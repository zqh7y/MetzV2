from flask import render_template, session, redirect, url_for, jsonify, abort
from data import (
    get_all_meetings, is_admin, is_trusted, approve_meeting, decline_meeting, USERS_DB,
    is_banned, set_banned, delete_user, set_trusted, platform_stats, generate_user_color,
)


def _require_admin():
    """Shared guard: return the admin's uid, or None if the caller isn't one."""
    uid = session.get("user", {}).get("uid", "")
    if "user" not in session or not is_admin(uid):
        return None
    return uid


def dashboard_route():
    """Developer dashboard: platform analytics plus every user and meeting in
    the database. Admin-only. Supports ban/unban, trust toggling, and deleting
    users or meetings."""
    uid = _require_admin()
    if uid is None:
        abort(403)

    users = sorted(USERS_DB.values(), key=lambda u: u.get("joined_at", ""), reverse=True)
    meetings = sorted(get_all_meetings(), key=lambda m: m.id, reverse=True)

    return render_template(
        "dashboard.html", users=users, meetings=meetings, uid=uid, is_admin=True,
        stats=platform_stats(), user_color=generate_user_color,
    )


def set_trust_route(target_uid):
    """Toggle a user's trusted status from the dashboard (JSON, unlike the
    form-based toggle on the user profile page)."""
    admin_uid = _require_admin()
    if admin_uid is None:
        return jsonify({"error": "forbidden"}), 403
    new_state = not is_trusted(target_uid)
    if set_trusted(target_uid, new_state, admin_uid):
        return jsonify({"status": "trusted" if new_state else "untrusted",
                        "is_trusted": new_state})
    return jsonify({"error": "forbidden"}), 403


def ban_route(target_uid):
    """Toggle ban on a user. Admins can't be banned."""
    admin_uid = session.get("user", {}).get("uid", "")
    banned = not is_banned(target_uid)
    if set_banned(target_uid, banned, admin_uid):
        return jsonify({"status": "banned" if banned else "unbanned"})
    return jsonify({"error": "forbidden"}), 403


def delete_user_route(target_uid):
    """Delete a user account. Admins can't be deleted."""
    admin_uid = session.get("user", {}).get("uid", "")
    if delete_user(target_uid, admin_uid):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "forbidden"}), 403


def pending_route():
    if "user" not in session:
        return redirect(url_for("login"))
    uid = session["user"].get("uid", "")
    if not is_admin(uid):
        abort(403)

    pending = get_all_meetings(status="pending")
    trusted_map = {m.creator_uid: is_trusted(m.creator_uid) for m in pending if m.creator_uid}

    return render_template("pending.html", meetings=pending, uid=uid, is_admin=True, trusted_map=trusted_map)


def approve_route(meeting_id):
    uid = session.get("user", {}).get("uid", "")
    if approve_meeting(meeting_id, uid):
        return jsonify({"status": "approved"})
    return jsonify({"error": "forbidden"}), 403


def decline_route(meeting_id):
    uid = session.get("user", {}).get("uid", "")
    if decline_meeting(meeting_id, uid):
        return jsonify({"status": "declined"})
    return jsonify({"error": "forbidden"}), 403
