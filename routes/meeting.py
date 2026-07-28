"""The single-meeting page.

Cards and map pins are summaries; this is the page a joined attendee actually
opens on the day. It is where the gated join link for an online meeting lives,
where the organiser marks who turned up, and where an attendee confirms they
went — everything that only makes sense for one meeting at a time.
"""
from flask import render_template, session, redirect, url_for, abort

from data import (MEETINGS_DB, attendee_rows, checkin_is_open, get_user, is_admin,
                  is_trusted, link_view, meeting_phase, seconds_until_start,
                  shorten_address, get_reliability, LATE_BAIL_HOURS, JOIN_WINDOW_MINUTES)
from utils.models import meeting_from_dict


def meeting_route(meeting_id):
    if "user" not in session:
        return redirect(url_for("login"))

    record = MEETINGS_DB.get(meeting_id)
    if not record:
        abort(404)

    uid = session["user"].get("uid", "")
    viewer_is_admin = is_admin(uid)

    # Pending meetings are still under review, so only their creator and
    # admins can reach them — the same rule the home list applies.
    if record.get("status") == "pending" and record.get("creator_uid") != uid and not viewer_is_admin:
        abort(404)

    meeting = meeting_from_dict(record)
    is_host = record.get("creator_uid") == uid or viewer_is_admin
    joined = uid in meeting.joined_uids

    return render_template(
        "meeting.html",
        meeting=meeting,
        uid=uid,
        is_online=bool(getattr(meeting, "link", "")),
        is_host=is_host,
        is_creator=record.get("creator_uid") == uid,
        is_admin=viewer_is_admin,
        joined=joined,
        waitlisted=uid in meeting.waitlist_uids,
        phase=meeting_phase(record),
        seconds_until_start=seconds_until_start(record),
        link=link_view(record, uid),
        short_location=shorten_address(getattr(meeting, "location", "")),
        attendees=attendee_rows(meeting_id),
        creator_is_trusted=is_trusted(record.get("creator_uid") or ""),
        checkin_open=checkin_is_open(record),
        my_attendance=(record.get("attendance") or {}).get(uid, ""),
        my_reliability=get_reliability(uid),
        late_bail_hours=LATE_BAIL_HOURS,
        window_minutes=JOIN_WINDOW_MINUTES,
        creator_profile=get_user(record.get("creator_uid") or ""),
    )
