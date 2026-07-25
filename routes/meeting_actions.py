"""Join / pass / delete actions on a meeting.

These are fetch() endpoints, not pages: the meeting cards on Home and the
"My Meetings" list on Profile call them. The standalone /swipe and /joined
pages that used to live here are gone — their content moved into those two
pages instead."""
import requests
from flask import session, jsonify
from data import user_pass, toggle_join_meeting, delete_meeting, get_joined_users_preview, MEETINGS_DB

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
    """Toggle a user's join on a meeting (join buttons on Home, leave on Profile)."""
    uid = session.get("user", {}).get("uid", "")
    result = toggle_join_meeting(uid, meeting_id)
    if result is None:
        return jsonify({"error": "not found"}), 404
    joined_uids = MEETINGS_DB[meeting_id].get("joined_uids", [])
    result["joined_preview"] = get_joined_users_preview(joined_uids)
    _notify_socket_server(meeting_id, {"count": result["count"], "joined_preview": result["joined_preview"]})
    return jsonify(result)


def delete_route(meeting_id):
    """Delete a meeting. Allowed for the meeting's creator or an admin."""
    uid = session.get("user", {}).get("uid", "")
    if delete_meeting(meeting_id, uid):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "forbidden"}), 403
