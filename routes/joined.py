from datetime import datetime
from flask import render_template, session, redirect, url_for, jsonify
from data import get_user, get_all_meetings, user_pass, toggle_join_meeting, delete_meeting, is_admin, is_trusted, get_joined_users_preview, shorten_address, MEETINGS_DB


def _parse_time(time_str):
    try:
        return datetime.strptime(time_str, "%Y-%m-%d %H:%M")
    except (ValueError, TypeError):
        return None


def joined_route():
    if "user" not in session:
        return redirect(url_for("login"))

    uid = session["user"].get("uid", "")
    user = get_user(uid)
    joined_ids = user["joined_meeting_ids"] if user else []

    all_meetings = {m.id: m for m in get_all_meetings()}
    joined = [all_meetings[mid] for mid in joined_ids if mid in all_meetings]

    parsed_times = {m.id: _parse_time(m.time) for m in joined}
    now = datetime.now()
    joined.sort(key=lambda m: parsed_times[m.id] or datetime.max)

    upcoming = [m for m in joined if parsed_times[m.id] and parsed_times[m.id] >= now]
    past = [m for m in joined if not parsed_times[m.id] or parsed_times[m.id] < now]

    trusted_map = {m.creator_uid: is_trusted(m.creator_uid) for m in joined if m.creator_uid}
    joined_previews = {m.id: get_joined_users_preview(m.joined_uids) for m in joined}
    short_locations = {m.id: shorten_address(getattr(m, "location", None)) for m in joined}

    stats = {
        "total": len(joined),
        "upcoming": len(upcoming),
        "online": len([m for m in joined if getattr(m, "link", None)]),
        "inperson": len([m for m in joined if getattr(m, "location", None)]),
    }

    return render_template(
        "joined.html", upcoming=upcoming, past=past, stats=stats,
        uid=uid, is_admin=is_admin(uid), trusted_map=trusted_map,
        joined_previews=joined_previews, short_locations=short_locations,
    )


def pass_route(meeting_id):
    """Swiping left: mark the meeting as seen without joining it."""
    uid = session.get("user", {}).get("uid", "")
    user_pass(uid, meeting_id)
    return jsonify({"status": "passed"})


def join_route(meeting_id):
    """Toggle a user's join on a meeting (used by swiping right and the join button)."""
    uid = session.get("user", {}).get("uid", "")
    result = toggle_join_meeting(uid, meeting_id)
    if result is None:
        return jsonify({"error": "not found"}), 404
    joined_uids = MEETINGS_DB[meeting_id].get("joined_uids", [])
    result["joined_preview"] = get_joined_users_preview(joined_uids)
    return jsonify(result)


def delete_route(meeting_id):
    """Delete a meeting. Allowed for the meeting's creator or an admin."""
    uid = session.get("user", {}).get("uid", "")
    if delete_meeting(meeting_id, uid):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "forbidden"}), 403
