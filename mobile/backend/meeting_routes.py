"""Browsing, creating, joining/passing, and deleting meetings — mirrors
screens/home.py, screens/create.py, screens/swipe.py, screens/joined.py from
the web app, reusing the exact same data.py functions."""

from flask import Blueprint, request, jsonify

from data import (
    get_user, get_all_meetings, add_meeting, toggle_join_meeting, filter_blocked,
    user_pass, delete_meeting, get_joined_users_preview, MEETINGS_DB,
    generate_user_color, display_name_for, is_trusted, is_admin, get_reliability,
    get_comments, add_comment, delete_comment, can_delete_comment, get_blocked_uids,
    record_checkin,
)
from utils.models import (
    InPersonMeeting, OnlineMeeting, AVAILABLE_TAGS,
    validate_meeting_data, sanitize_html, validate_comment,
)

from helpers import current_uid, serialize_meeting

# Reuse the web's own threshold parsing and validation rather than writing a
# second set of rules that could drift from it.
from routes.create import parse_count, validate_threshold

meeting_bp = Blueprint("meetings", __name__)


@meeting_bp.route("/api/tags")
def tags():
    return jsonify(AVAILABLE_TAGS)


@meeting_bp.route("/api/meetings")
def list_meetings():
    uid = current_uid()
    # Blocking is only real if it reaches the listings — filtered here rather
    # than at creation, so unblocking brings the meetings straight back.
    meetings = filter_blocked(uid, get_all_meetings(status="approved"))
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

    # "It only happens if enough people come" — the web's step 4. Without these
    # the app could never create a threshold meeting at all.
    min_attendees = parse_count(body.get("min_attendees", ""))
    max_attendees = parse_count(body.get("max_attendees", ""))
    join_deadline = (body.get("join_deadline") or "").strip()

    errors = validate_meeting_data(title, description, time, meeting_type,
                                    location_name=location_name, link=link)
    errors += validate_threshold(min_attendees, max_attendees, join_deadline, time)
    if errors:
        return jsonify({"error": " | ".join(errors)}), 400

    title = sanitize_html(title)
    description = sanitize_html(description)
    location_name = sanitize_html(location_name)

    if meeting_type == "inperson":
        try:
            lat = float(body.get("lat"))
            lng = float(body.get("lng"))
        except (TypeError, ValueError):
            lat = lng = None
        new_meeting = InPersonMeeting(
            id=0, title=title, description=description, time=time,
            location=location_name, lat=lat, lng=lng, emoji=emoji, tags=tags_in,
            min_attendees=min_attendees, max_attendees=max_attendees,
            join_deadline=join_deadline,
        )
    else:
        new_meeting = OnlineMeeting(
            id=0, title=title, description=description, time=time,
            link=link, emoji=emoji, tags=tags_in,
            min_attendees=min_attendees, max_attendees=max_attendees,
            join_deadline=join_deadline,
        )

    add_meeting(new_meeting, creator_uid=uid)
    return jsonify({"id": new_meeting.id, "status": new_meeting.status})


@meeting_bp.route("/api/meetings/<int:meeting_id>/join", methods=["POST"])
def join_meeting(meeting_id):
    uid = current_uid()
    # The commitment sheet and the late-bail warning are web-app screens for
    # now, so the mobile client joins straight through rather than being told
    # to show a sheet it doesn't have yet.
    result = toggle_join_meeting(uid, meeting_id, pledge=True, confirm_bail=True)
    if result is None:
        return jsonify({"error": "not found"}), 404
    result["joined_preview"] = get_joined_users_preview(MEETINGS_DB[meeting_id].get("joined_uids", []))
    return jsonify(result)


@meeting_bp.route("/api/meetings/<int:meeting_id>/attendees")
def meeting_attendees(meeting_id):
    """Everyone who has joined, not just the four-avatar preview.

    serialize_meeting() only carries `joined_preview` (capped at 4, and with no
    usernames), which is enough for a card but not for a "who's coming" list.
    """
    meeting = MEETINGS_DB.get(meeting_id)
    if meeting is None:
        return jsonify({"error": "not found"}), 404

    attendees = []
    for uid in meeting.get("joined_uids", []):
        attendees.append({
            "uid": uid,
            "username": display_name_for(uid),
            "color": generate_user_color(uid),
            "initial": (display_name_for(uid) or uid)[:1].upper(),
            "is_trusted": is_trusted(uid),
            "is_admin": is_admin(uid),
            "is_creator": uid == meeting.get("creator_uid"),
            # The web's attendee rows carry a show-up rate; same source, so the
            # two clients can't disagree about someone's record.
            "reliability": get_reliability(uid),
            "is_guest": False,
        })

    # People who came in through the share link. They were counted in
    # joined_count from the start but were missing from this list, so a meeting
    # read "4 going" above a list of three — the organiser could see that
    # someone had joined and never who.
    #
    # No uid, so there is nothing to open a profile on and no show-up record to
    # report; the client is told plainly with is_guest rather than being left to
    # infer it from missing fields.
    for guest in meeting.get("guests", []):
        name = guest.get("name") or "Guest"
        attendees.append({
            # Prefixed so it cannot collide with a real uid — the client uses
            # this as a list key and to decide whether it is looking at itself.
            "uid": f"guest:{guest.get('id')}",
            "username": name,
            "color": generate_user_color(f"guest:{name}"),
            "initial": name[:1].upper(),
            "is_trusted": False,
            "is_admin": False,
            "is_creator": False,
            "is_guest": True,
            "reliability": None,
        })

    return jsonify(attendees)


def _serialize_comment(comment, meeting, viewer_uid):
    """One comment in the shape the detail screen draws.

    Author identity is resolved live (display_name_for) rather than trusting the
    denormalised username, so a rename shows up on old comments too; the stored
    copy is only the fallback for an account that no longer exists.
    """
    author_uid = comment.get("uid", "")
    name = display_name_for(author_uid) or comment.get("username") or author_uid
    return {
        "id": comment.get("id"),
        "uid": author_uid,
        "username": name,
        "text": comment.get("text", ""),
        "created_at": comment.get("created_at", ""),
        "color": generate_user_color(author_uid),
        "initial": (name or "?")[:1].upper(),
        "is_trusted": is_trusted(author_uid),
        "is_admin": is_admin(author_uid),
        "is_host": author_uid == meeting.get("creator_uid"),
        "is_mine": author_uid == viewer_uid,
        # Sent so the client never has to re-derive the rule and get it wrong.
        "can_delete": can_delete_comment(viewer_uid, meeting, comment),
    }


@meeting_bp.route("/api/meetings/<int:meeting_id>/comments")
def meeting_comments(meeting_id):
    """The discussion on a meeting, oldest first."""
    meeting = MEETINGS_DB.get(meeting_id)
    if meeting is None:
        return jsonify({"error": "not found"}), 404

    uid = current_uid()
    # Blocking is applied on read for the same reason it is for meetings: it
    # only counts if it reaches what you actually look at, and unblocking
    # should bring the comments straight back rather than having lost them.
    blocked = set(get_blocked_uids(uid)) if uid else set()
    return jsonify([
        _serialize_comment(c, meeting, uid)
        for c in get_comments(meeting_id)
        if c.get("uid") not in blocked
    ])


@meeting_bp.route("/api/meetings/<int:meeting_id>/comments", methods=["POST"])
def create_comment(meeting_id):
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    meeting = MEETINGS_DB.get(meeting_id)
    if meeting is None:
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True) or {}
    text = sanitize_html(body.get("text", ""))

    # Validated here as well as inside add_comment so the client gets the real
    # reason ("too long") instead of a bare failure.
    errors = validate_comment(text)
    if errors:
        return jsonify({"error": errors[0]}), 400

    comment = add_comment(meeting_id, uid, text)
    if not comment:
        return jsonify({"error": "Could not post comment."}), 400
    return jsonify(_serialize_comment(comment, meeting, uid)), 201


@meeting_bp.route(
    "/api/meetings/<int:meeting_id>/comments/<int:comment_id>", methods=["DELETE"]
)
def remove_comment(meeting_id, comment_id):
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401
    if not delete_comment(meeting_id, comment_id, uid):
        # One answer for "not there" and "not yours": otherwise the response
        # tells a stranger which comment ids exist.
        return jsonify({"error": "forbidden"}), 403
    return jsonify({"status": "deleted"})


@meeting_bp.route("/api/meetings/<int:meeting_id>/checkin", methods=["POST"])
def checkin(meeting_id):
    """Answer "did you go?" for a meeting that is over.

    Activity has listed this question since it was written, but the mobile API
    never had a route to answer it — the only way to settle a meeting was the
    web page. So the show-up rate the app keeps showing could not be moved from
    inside the app.

    record_checkin does the deciding: it refuses a meeting you never joined, a
    status outside went/missed, and anything not yet finished. The updated
    reliability comes back with the answer so the caller can redraw the score
    without a second request.
    """
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(force=True) or {}
    status = (body.get("status") or "").strip().lower()

    result = record_checkin(uid, meeting_id, status)
    if not result:
        # One answer for every refusal: which of the three it was is not
        # something the caller can act on differently.
        return jsonify({"error": "Can't record that yet."}), 400
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
