"""Join / pass / delete actions on a meeting.

These are fetch() endpoints, not pages: the meeting cards on Home and the
"My Meetings" list on Profile call them. The standalone /swipe and /joined
pages that used to live here are gone — their content moved into those two
pages instead."""
import requests
from flask import session, jsonify, request
from data import (user_pass, toggle_join_meeting, delete_meeting, get_joined_users_preview,
                  decide_threshold, record_checkin, set_attendance, attendee_rows,
                  MEETINGS_DB)

BROADCAST_URL = "http://127.0.0.1:8766/broadcast"


def _notify_socket_server(meeting_id, payload):
    """Tell the standalone socket_server.py about a join/leave so it can
    push a live update to everyone else viewing this meeting. Best-effort:
    if the socket server isn't running, joining a meeting must still work."""
    try:
        requests.post(BROADCAST_URL, json={"meeting_id": meeting_id, **payload}, timeout=0.5)
    except requests.exceptions.RequestException:
        pass


def pass_route(meeting_id):
    """"Pass" on a meeting from the For You shelf: mark it seen without joining."""
    uid = session.get("user", {}).get("uid", "")
    user_pass(uid, meeting_id)
    return jsonify({"status": "passed"})


def join_route(meeting_id):
    """Toggle a user's join on a meeting (join buttons on Home, leave on Profile).

    Joining is gated: with no `pledge` in the body the data layer answers with
    the details the commitment sheet needs instead of joining, and the browser
    re-posts once the user has actually promised to turn up. Leaving close to
    the start needs `confirm_bail` the same way.
    """
    uid = session.get("user", {}).get("uid", "")
    body = request.get_json(silent=True) or {}

    result = toggle_join_meeting(
        uid, meeting_id,
        pledge=bool(body.get("pledge")),
        confirm_bail=bool(body.get("confirm_bail")),
    )
    if result is None:
        return jsonify({"error": "not found"}), 404

    # Nothing changed yet — the browser has a sheet to show first.
    if result.get("needs_commitment") or result.get("needs_bail_confirm"):
        return jsonify(result)

    joined_uids = MEETINGS_DB[meeting_id].get("joined_uids", [])
    result["joined_preview"] = get_joined_users_preview(joined_uids)
    _notify_socket_server(meeting_id, {"count": result["count"], "joined_preview": result["joined_preview"]})
    return jsonify(result)


def checkin_route(meeting_id):
    """An attendee answering "did you go?" once the meeting is over."""
    uid = session.get("user", {}).get("uid", "")
    body = request.get_json(silent=True) or {}

    result = record_checkin(uid, meeting_id, body.get("status", ""))
    if result is None:
        return jsonify({"error": "You can't check in to that meeting yet."}), 403
    return jsonify(result)


def attendance_route(meeting_id):
    """The organiser marking one attendee as having turned up or not."""
    uid = session.get("user", {}).get("uid", "")
    body = request.get_json(silent=True) or {}

    result = set_attendance(meeting_id, uid, body.get("uid", ""), body.get("status", ""))
    if result is None:
        return jsonify({"error": "Not allowed, or that meeting isn't over yet."}), 403
    result["rows"] = attendee_rows(meeting_id)
    return jsonify(result)


def delete_route(meeting_id):
    """Delete a meeting. Allowed for the meeting's creator or an admin."""
    uid = session.get("user", {}).get("uid", "")
    if delete_meeting(meeting_id, uid):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "forbidden"}), 403


def decide_route(meeting_id):
    """Organiser's verdict once a threshold deadline passes short of the
    minimum: run it anyway, extend the deadline, or call it off."""
    uid = session.get("user", {}).get("uid", "")
    body = request.get_json(silent=True) or {}
    action = body.get("action", "")
    new_deadline = body.get("deadline", "")

    result = decide_threshold(meeting_id, uid, action, new_deadline)
    if result is None:
        return jsonify({"error": "Not allowed, or that action doesn't make sense here."}), 403
    return jsonify(result)
