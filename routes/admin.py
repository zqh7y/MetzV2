from flask import render_template, session, redirect, url_for, jsonify, abort
from data import get_all_meetings, is_admin, is_trusted, approve_meeting, decline_meeting


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
