"""Browsing, creating, joining/passing, and deleting meetings — mirrors
screens/home.py, screens/create.py, screens/swipe.py, screens/joined.py from
the web app, reusing the exact same data.py functions."""

from flask import Blueprint, request, jsonify

from data import (
    get_user, get_all_meetings, add_meeting, toggle_join_meeting,
    user_pass, delete_meeting, get_joined_users_preview, MEETINGS_DB,
)
from functions.models import (
    InPersonMeeting, OnlineMeeting, AVAILABLE_TAGS,
    validate_meeting_data, sanitize_html,
)

from helpers import current_uid, serialize_meeting

meeting_bp = Blueprint("meetings", __name__)


@meeting_bp.route("/api/tags")
def tags():
    return jsonify(AVAILABLE_TAGS)


@meeting_bp.route("/api/meetings")
def list_meetings():
    uid = current_uid()
    meetings = get_all_meetings(status="approved")
    return jsonify([serialize_meeting(m, uid) for m in meetings])


@meeting_bp.route("/api/meetings", methods=["POST"])
def create_meeting():
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(force=True) or {}
    title = body.get("title", "")
    description = body.get("description", "")
    time = body.get("time", "")
    meeting_type = body.get("type", "")
    location_name = body.get("location_name", "")
    link = body.get("link", "")
    emoji = (body.get("emoji") or "").strip()
    tags_in = [t for t in body.get("tags", []) if t in AVAILABLE_TAGS]

    errors = validate_meeting_data(title, description, time, meeting_type,
                                    location_name=location_name, link=link)
    if errors:
        return jsonify({"error": " | ".join(errors)}), 400

    title = sanitize_html(title)
    description = sanitize_html(description)

    if meeting_type == "inperson":
        try:
            lat = float(body.get("lat"))
            lng = float(body.get("lng"))
        except (TypeError, ValueError):
            lat = lng = None
        new_meeting = InPersonMeeting(
            id=0, title=title, description=description, time=time,
            location=location_name, lat=lat, lng=lng, emoji=emoji, tags=tags_in,
        )
    else:
        new_meeting = OnlineMeeting(
            id=0, title=title, description=description, time=time,
            link=link, emoji=emoji, tags=tags_in,
        )

    add_meeting(new_meeting, creator_uid=uid)
    return jsonify({"id": new_meeting.id, "status": new_meeting.status})


@meeting_bp.route("/api/meetings/<int:meeting_id>/join", methods=["POST"])
def join_meeting(meeting_id):
    uid = current_uid()
    result = toggle_join_meeting(uid, meeting_id)
    if result is None:
        return jsonify({"error": "not found"}), 404
    result["joined_preview"] = get_joined_users_preview(MEETINGS_DB[meeting_id].get("joined_uids", []))
    return jsonify(result)


@meeting_bp.route("/api/meetings/<int:meeting_id>/pass", methods=["POST"])
def pass_meeting(meeting_id):
    user_pass(current_uid(), meeting_id)
    return jsonify({"status": "passed"})


@meeting_bp.route("/api/meetings/<int:meeting_id>", methods=["DELETE"])
def delete_meeting_route(meeting_id):
    if delete_meeting(meeting_id, current_uid()):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "forbidden"}), 403


@meeting_bp.route("/api/joined")
def joined_meetings():
    uid = current_uid()
    user = get_user(uid)
    joined_ids = user["joined_meeting_ids"] if user else []
    all_meetings = {m.id: m for m in get_all_meetings()}
    joined = [all_meetings[mid] for mid in joined_ids if mid in all_meetings]
    return jsonify([serialize_meeting(m, uid) for m in joined])
