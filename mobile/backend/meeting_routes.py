"""Browsing, creating, joining/passing, and deleting meetings — mirrors
screens/home.py, screens/create.py, screens/swipe.py, screens/joined.py from
the web app, reusing the exact same data.py functions."""

import re

from flask import Blueprint, request, jsonify

from data import (
    get_user, get_all_meetings, add_meeting, toggle_join_meeting, filter_blocked,
    can_view_meeting, PUBLIC, PRIVATE,
    user_pass, delete_meeting, get_joined_users_preview, MEETINGS_DB,
    in_viewer_country,
    generate_user_color, display_name_for, is_trusted, is_admin, get_reliability,
    get_comments, add_comment, delete_comment, can_delete_comment, get_blocked_uids,
    record_checkin, meeting_insights, host_dashboard,
    update_meeting, cancel_meeting, uncancel_meeting, decide_threshold,
)
from utils.models import (
    InPersonMeeting, OnlineMeeting, AVAILABLE_TAGS, meeting_from_dict,
    validate_meeting_data, sanitize_html, validate_comment,
)

from helpers import current_uid, serialize_meeting, share_url_for
import push

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
    # viewer_uid, not include_private: this adds back only the private
    # meetings this person created or joined, so a link-only meeting is still
    # findable by the people actually in it.
    meetings = filter_blocked(uid, get_all_meetings(status="approved", viewer_uid=uid))

    # Meetings somewhere else in the world are not a listing, they are noise: a
    # meetup in another country is not something anyone here can attend. The
    # filter only hides meetings known to be elsewhere — see
    # data.in_viewer_country() for why it fails open in every other case.
    viewer_country = (get_user(uid) or {}).get("country")
    meetings = [
        m for m in meetings
        if in_viewer_country(MEETINGS_DB.get(getattr(m, "id", None)), viewer_country)
    ]
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
    # Anything that is not exactly "private" is public — an unrecognised value
    # must not silently hide a meeting the organiser meant everyone to see.
    visibility = PRIVATE if body.get("visibility") == PRIVATE else PUBLIC

    # "It only happens if enough people come" — the web's step 4. Without these
    # the app could never create a threshold meeting at all.
    min_attendees = parse_count(body.get("min_attendees", ""))
    max_attendees = parse_count(body.get("max_attendees", ""))
    join_deadline = (body.get("join_deadline") or "").strip()

    # The three questions every meeting that omits them gets asked anyway.
    # All optional, and all sanitised rather than validated into a shape: an
    # end time that is not "HH:MM" and an age that is not a number are dropped,
    # because refusing the whole meeting over "sevenish" would be worse than
    # not knowing when it ends.
    ends_at = (body.get("ends_at") or "").strip()
    if not re.fullmatch(r"[0-2]?\d:[0-5]\d", ends_at or ""):
        ends_at = ""
    cost = sanitize_html((body.get("cost") or "").strip())[:40]
    try:
        min_age = max(0, min(120, int(body.get("min_age") or 0)))
    except (TypeError, ValueError):
        min_age = 0

    # A deadline is optional now, and defaults to the meeting's own start time.
    #
    # validate_threshold() refuses a minimum without one, and it lives in
    # routes/create.py — the web app, which is out of bounds — so the default is
    # applied here rather than the rule being relaxed there. It is also the
    # honest default: the last moment somebody can usefully join something is
    # the moment it begins, and an organiser who wants to know sooner can still
    # say so.
    if min_attendees and not join_deadline:
        join_deadline = time

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
            ends_at=ends_at, cost=cost, min_age=min_age,
        )
    else:
        new_meeting = OnlineMeeting(
            id=0, title=title, description=description, time=time,
            link=link, emoji=emoji, tags=tags_in,
            min_attendees=min_attendees, max_attendees=max_attendees,
            join_deadline=join_deadline,
            ends_at=ends_at, cost=cost, min_age=min_age,
        )

    add_meeting(new_meeting, creator_uid=uid, visibility=visibility)
    record = MEETINGS_DB.get(new_meeting.id, {})
    # Only when it is actually held: a trusted organiser's meeting goes live
    # immediately and there is nothing for a moderator to do.
    if new_meeting.status == "pending":
        push.meeting_awaiting_review(new_meeting.id)
    return jsonify({
        "id": new_meeting.id,
        "status": new_meeting.status,
        "visibility": record.get("visibility", PUBLIC),
        "share_url": share_url_for(record),
    })


@meeting_bp.route("/api/meetings/<int:meeting_id>/join", methods=["POST"])
def join_meeting(meeting_id):
    uid = current_uid()
    record = MEETINGS_DB.get(meeting_id)
    if record is not None and not can_view_meeting(uid, record):
        return jsonify({"error": "not found"}), 404
    # The commitment sheet and the late-bail warning are web-app screens for
    # now, so the mobile client joins straight through rather than being told
    # to show a sheet it doesn't have yet.
    result = toggle_join_meeting(uid, meeting_id, pledge=True, confirm_bail=True)
    if result is None:
        return jsonify({"error": "not found"}), 404
    # Only on the way in. Leaving is not news the organiser can act on, and a
    # notification for it would read as a reprimand.
    if uid in (MEETINGS_DB.get(meeting_id, {}).get("joined_uids") or []):
        push.meeting_joined(meeting_id, uid)
    result["joined_preview"] = get_joined_users_preview(MEETINGS_DB[meeting_id].get("joined_uids", []))
    return jsonify(result)


@meeting_bp.route("/api/meetings/<int:meeting_id>/attendees")
def meeting_attendees(meeting_id):
    """Everyone who has joined, not just the four-avatar preview.

    serialize_meeting() only carries `joined_preview` (capped at 4, and with no
    usernames), which is enough for a card but not for a "who's coming" list.
    """
    meeting = MEETINGS_DB.get(meeting_id)
    # 404 rather than 403 for a private meeting: a "forbidden" would confirm
    # that a meeting exists at that id, which is the one thing the unguessable
    # link is meant to prevent.
    if meeting is None or not can_view_meeting(current_uid(), meeting):
        return jsonify({"error": "not found"}), 404

    attendees = []
    for uid in meeting.get("joined_uids", []):
        attendees.append({
            "uid": uid,
            "username": display_name_for(uid),
            "color": generate_user_color(uid),
            "avatar_emoji": (get_user(uid) or {}).get("avatar_emoji") or "",
            "avatar_face": (get_user(uid) or {}).get("avatar_face") or "",
            "profile_frame": (get_user(uid) or {}).get("profile_frame") or "none",
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
        "avatar_face": (get_user(author_uid) or {}).get("avatar_face") or "",
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
    uid = current_uid()
    if meeting is None or not can_view_meeting(uid, meeting):
        return jsonify({"error": "not found"}), 404

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
    if meeting is None or not can_view_meeting(uid, meeting):
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
    # After the write, so a failure to notify cannot lose the comment.
    push.meeting_comment(meeting_id, uid, text)
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


@meeting_bp.route("/api/meetings/<int:meeting_id>/insights")
def meeting_insights_route(meeting_id):
    """How one meeting is actually doing, for the person running it.

    404 rather than 403 when the caller is not the organiser: a "forbidden"
    would confirm the meeting exists, and the same ids are handed out publicly
    in share links. meeting_insights() decides who counts as the organiser, so
    the rule lives with the data rather than being re-stated per route.
    """
    uid = current_uid()
    if not uid:
        return jsonify({"error": "unauthorized"}), 401
    view = meeting_insights(meeting_id, uid)
    if view is None:
        return jsonify({"error": "not found"}), 404
    # Built here rather than in data.py, which has no request to take a host
    # from — the same reason share_url_for lives in helpers.
    view["share_url"] = share_url_for(MEETINGS_DB.get(meeting_id))
    return jsonify(view)


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


@meeting_bp.route("/api/meetings/<int:meeting_id>")
def one_meeting(meeting_id):
    """One meeting, as it stands right now.

    The app used to render a meeting entirely from the card that was tapped,
    which is a snapshot of whenever the listing was fetched. For an online
    meeting that is not good enough: whether the call link is open changes with
    the clock, so a screen left open, or reached from somewhere that only knows
    an id, would show the wrong state.

    404 rather than 403 when it may not be seen, matching every other route
    here — a "forbidden" would confirm which ids exist.
    """
    uid = current_uid()
    record = MEETINGS_DB.get(meeting_id)
    if record is None or not can_view_meeting(uid, record):
        return jsonify({"error": "not found"}), 404
    m = next((x for x in get_all_meetings(status=None, viewer_uid=uid)
              if x.id == meeting_id), None)
    if m is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(serialize_meeting(m, uid))


@meeting_bp.route("/api/meetings/<int:meeting_id>", methods=["DELETE"])
def delete_meeting_route(meeting_id):
    if delete_meeting(meeting_id, current_uid()):
        return jsonify({"status": "deleted"})
    return jsonify({"error": "forbidden"}), 403



@meeting_bp.route("/api/meetings/<int:meeting_id>", methods=["PATCH"])
def edit_meeting_route(meeting_id):
    """Change a meeting that already exists.

    The gap this fills: there was no update of any kind, so correcting a typo
    in the time meant deleting and re-posting — which breaks the share link
    already sent to a group chat and drops everyone who had joined.

    Only the fields that were sent are touched, so a client editing one thing
    does not have to send back a whole meeting it might be holding a stale copy
    of. Everything is validated the same way creating it was; there is no
    second, looser set of rules for edits.
    """
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    record = MEETINGS_DB.get(meeting_id)
    if not record:
        return jsonify({"error": "not found"}), 404

    body = request.get_json(force=True) or {}
    changes = {}

    if "title" in body:
        changes["title"] = sanitize_html(body.get("title") or "")
    if "description" in body:
        changes["description"] = sanitize_html(body.get("description") or "")
    if "time" in body:
        changes["time"] = (body.get("time") or "").strip()
    if "location_name" in body:
        changes["location"] = sanitize_html(body.get("location_name") or "")
    if "emoji" in body:
        changes["emoji"] = (body.get("emoji") or "").strip()
    if "tags" in body:
        changes["tags"] = [t for t in (body.get("tags") or []) if t in AVAILABLE_TAGS]

    if "lat" in body or "lng" in body:
        try:
            changes["lat"] = float(body.get("lat"))
            changes["lng"] = float(body.get("lng"))
        except (TypeError, ValueError):
            changes["lat"] = changes["lng"] = None

    if "ends_at" in body:
        ends_at = (body.get("ends_at") or "").strip()
        changes["ends_at"] = ends_at if re.fullmatch(r"[0-2]?\d:[0-5]\d", ends_at or "") else ""
    if "cost" in body:
        changes["cost"] = sanitize_html((body.get("cost") or "").strip())[:40]
    if "min_age" in body:
        try:
            changes["min_age"] = max(0, min(120, int(body.get("min_age") or 0)))
        except (TypeError, ValueError):
            changes["min_age"] = 0

    if "min_attendees" in body:
        changes["min_attendees"] = parse_count(body.get("min_attendees", ""))
    if "max_attendees" in body:
        changes["max_attendees"] = parse_count(body.get("max_attendees", ""))
    if "join_deadline" in body:
        changes["join_deadline"] = (body.get("join_deadline") or "").strip()

    # Validated against the meeting as it will be, not as it was: sending a new
    # time and nothing else still has to be checked against the location that
    # is already stored.
    merged = dict(record)
    merged.update(changes)
    is_online = bool(merged.get("link"))
    errors = validate_meeting_data(
        merged.get("title", ""), merged.get("description", ""), merged.get("time", ""),
        "online" if is_online else "inperson",
        location_name=merged.get("location", ""), link=merged.get("link", ""),
    )
    errors += validate_threshold(
        int(merged.get("min_attendees") or 0),
        int(merged.get("max_attendees") or 0),
        merged.get("join_deadline") or merged.get("time", ""),
        merged.get("time", ""),
    )
    if errors:
        return jsonify({"error": " | ".join(errors)}), 400

    updated = update_meeting(meeting_id, uid, changes)
    if updated is None:
        # Not the organiser. 404 rather than 403 for the same reason as the
        # insights route: ids travel in public share links, and a 403 confirms
        # one exists.
        return jsonify({"error": "not found"}), 404

    # Everyone who said they would come is told, because the reason to edit a
    # meeting is almost always that something they were relying on changed.
    if "time" in changes or "location" in changes:
        push.meeting_changed(meeting_id, actor_uid=uid)

    return jsonify(serialize_meeting(meeting_from_dict(MEETINGS_DB[meeting_id]), uid))


@meeting_bp.route("/api/meetings/<int:meeting_id>/cancel", methods=["POST"])
def cancel_meeting_route(meeting_id):
    """Call it off without deleting it.

    Deleting makes the link 404, which tells somebody who was going nothing at
    all. A cancelled meeting keeps its page and says why.
    """
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(force=True) or {}
    reason = body.get("reason") or ""

    if body.get("undo"):
        updated = uncancel_meeting(meeting_id, uid)
    else:
        updated = cancel_meeting(meeting_id, uid, reason)

    if updated is None:
        return jsonify({"error": "not found"}), 404

    if not body.get("undo"):
        push.meeting_cancelled(meeting_id, reason, actor_uid=uid)

    return jsonify(serialize_meeting(meeting_from_dict(MEETINGS_DB[meeting_id]), uid))


@meeting_bp.route("/api/meetings/<int:meeting_id>/decide", methods=["POST"])
def decide_threshold_route(meeting_id):
    """"It did not fill. What do you want to do?"

    The create form has always promised this — "if it does not fill by the
    deadline, you decide what to do" — and decide_threshold() has always
    existed, wired only into the old web app. The phone had no way to answer,
    so the promise went unkept and the meeting sat in "awaiting" forever.
    """
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(force=True) or {}
    action = (body.get("action") or "").strip()
    result = decide_threshold(meeting_id, uid, action, body.get("new_deadline", ""))
    if result is None:
        return jsonify({"error": "not found"}), 404

    if action == "cancel":
        push.meeting_cancelled(meeting_id, "", actor_uid=uid)
    elif action in ("run", "extend"):
        push.meeting_decided_threshold(meeting_id, action, actor_uid=uid)

    return jsonify(result)


@meeting_bp.route("/api/meetings/<int:meeting_id>/announce", methods=["POST"])
def announce_route(meeting_id):
    """Tell everyone who is coming something.

    A discussion comment reaches whoever opens the meeting again; this reaches
    the phones of the people who said they would be there, which is what an
    organiser means by "I need to tell them". It is posted into the discussion
    as well, so somebody who reads it later sees the same words rather than a
    notification they have already dismissed.
    """
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    m = MEETINGS_DB.get(meeting_id)
    if not m:
        return jsonify({"error": "not found"}), 404
    if m.get("creator_uid") != uid and not is_admin(uid):
        return jsonify({"error": "not found"}), 404

    text = (request.get_json(force=True) or {}).get("text") or ""
    text = text.strip()
    if not text:
        return jsonify({"error": "Say something first."}), 400

    created = add_comment(meeting_id, uid, text[:300])
    if created is None:
        return jsonify({"error": "could not post"}), 400

    push.meeting_announcement(meeting_id, text[:300], actor_uid=uid)
    return jsonify(created)


@meeting_bp.route("/api/hosting/dashboard")
def hosting_dashboard():
    """Every meeting the caller has run, with the figures for each.

    Registered before /api/hosting so the more specific rule wins; Flask would
    match either way, but the ordering says which is the special case.
    """
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401
    view = host_dashboard(uid)
    if view is None:
        return jsonify({"error": "unauthorized"}), 401
    for row in view["meetings"]:
        row["share_url"] = share_url_for(MEETINGS_DB.get(row["id"]))
    return jsonify(view)


@meeting_bp.route("/api/hosting")
def hosting():
    """The meetings the caller is running — what the organiser's panel shows.

    Deliberately not the same as /api/meetings filtered client-side: this
    includes their *pending* ones. An organiser who has just posted something
    needs to see that it is waiting on review, and the public listings hide it
    precisely because it has not been approved yet.

    Past meetings are dropped: the panel is about what still needs attention,
    and something that already happened does not.
    """
    from datetime import datetime

    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    now = datetime.now()
    rows = []
    for record in MEETINGS_DB.values():
        if record.get("creator_uid") != uid:
            continue
        if record.get("status") == "declined":
            continue
        try:
            at = datetime.strptime(record.get("time", ""), "%Y-%m-%d %H:%M")
        except (TypeError, ValueError):
            continue
        if at < now:
            continue
        rows.append((at, record))

    rows.sort(key=lambda pair: pair[0])
    # Serialising goes through the model the rest of the API uses, so a card on
    # this panel is fed exactly what a card anywhere else is. Built once as a
    # lookup rather than per row: get_all_meetings() walks the whole table.
    out = []
    by_id = {m.id: m for m in get_all_meetings(status=None, viewer_uid=uid)}
    for _, record in rows:
        m = by_id.get(record.get("id"))
        if m is None:
            continue
        data = serialize_meeting(m, uid)
        data["status"] = record.get("status")
        out.append(data)
    return jsonify(out)


@meeting_bp.route("/api/joined")
def joined_meetings():
    uid = current_uid()
    user = get_user(uid)
    joined_ids = user["joined_meeting_ids"] if user else []
    all_meetings = {m.id: m for m in get_all_meetings(viewer_uid=uid)}
    joined = [all_meetings[mid] for mid in joined_ids if mid in all_meetings]
    return jsonify([serialize_meeting(m, uid) for m in joined])
