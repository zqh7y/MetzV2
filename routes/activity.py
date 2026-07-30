"""Activity — everything that currently wants something from you.

The app already knew all of this; it was just scattered. A check-in sat on the
profile page, a threshold decision sat on the meeting page, and a meeting
starting in an hour sat nowhere at all unless you went looking. This gathers
them into one list, ordered by how soon they matter.

Deliberately derived rather than stored: there is no per-join timestamp in the
data, so a real "someone joined 2h ago" feed would be invented. Everything
here is computed from the current state and is therefore always true.
"""

from flask import render_template, session, redirect, url_for

from data import (
    MEETINGS_DB, get_user, get_all_meetings, is_admin, is_trusted,
    seconds_until_start, checkin_is_open, meeting_phase, shorten_address,
    generate_user_color, get_reliability,
)

# A meeting counts as "coming up" inside this window. Beyond it, it is not
# something you need to think about today.
SOON_SECONDS = 7 * 24 * 3600


def _card(m):
    """The small shape the activity template renders."""
    return {
        "id": m["id"],
        "title": m.get("title", ""),
        "time": m.get("time", ""),
        "emoji": m.get("emoji") or "📍",
        "is_online": bool(m.get("link")),
        "where": shorten_address(m.get("location")) or ("Online" if m.get("link") else ""),
        "joined_count": len(m.get("joined_uids", [])),
        "min_attendees": int(m.get("min_attendees") or 0),
        "commit_status": m.get("commit_status"),
        "seconds": seconds_until_start(m),
    }


def _by_soonest(items):
    """Soonest first; anything without a usable time sinks to the bottom."""
    return sorted(items, key=lambda c: (c["seconds"] is None, c["seconds"]))


def pending_action_count(uid):
    """How many things are waiting on this user.

    Shared with the drawer badge via app.py's context processor, so the number
    on the badge and the number on the page can never disagree.
    """
    user = get_user(uid)
    if not user:
        return 0

    joined_ids = set(user.get("joined_meeting_ids", []))
    created_ids = set(user.get("created_meeting_ids", []))
    count = 0

    for mid, m in MEETINGS_DB.items():
        attendance = m.get("attendance") or {}
        over = checkin_is_open(m)
        if mid in joined_ids and over and uid not in attendance:
            count += 1
        if mid in created_ids and over and len(attendance) < len(m.get("joined_uids", [])):
            count += 1
        if mid in created_ids and m.get("commit_status") == "awaiting":
            count += 1
    return count


def activity_data(uid):
    """Every section of the Activity page, derived from current state.

    Split out from the route so the mobile API can serve the same sections from
    the same code — otherwise the two clients would each decide for themselves
    what counts as "needs your answer", and drift.

    Returns None when the uid is not a real user, leaving the caller to decide
    whether that is a redirect or a 401.
    """
    user = get_user(uid)
    if not user:
        return None

    joined_ids = set(user.get("joined_meeting_ids", []))
    created_ids = set(user.get("created_meeting_ids", []))

    needs_checkin = []      # you were there (or weren't) and nobody has said
    needs_attendance = []   # you organised it and have not marked who came
    needs_decision = []     # your threshold meeting missed its minimum
    coming_up = []          # joined, still in the future
    waiting = []            # your meetings an admin has not approved yet
    waitlisted = []         # you are queued for a full meeting
    settled = []            # threshold resolved recently, for information

    for mid, m in MEETINGS_DB.items():
        attendance = m.get("attendance") or {}
        is_mine = mid in created_ids
        is_joined = mid in joined_ids
        over = checkin_is_open(m)

        if is_joined and over and uid not in attendance:
            needs_checkin.append(_card(m))

        if is_mine and over and len(attendance) < len(m.get("joined_uids", [])):
            needs_attendance.append(_card(m))

        if is_mine and m.get("commit_status") == "awaiting":
            needs_decision.append(_card(m))

        if is_joined and not over:
            secs = seconds_until_start(m)
            if secs is None or secs <= SOON_SECONDS:
                coming_up.append(_card(m))

        if is_mine and m.get("status") == "pending":
            waiting.append(_card(m))

        if uid in (m.get("waitlist_uids") or []):
            waitlisted.append(_card(m))

        if is_joined and m.get("commit_status") in ("confirmed", "cancelled") and not over:
            settled.append(_card(m))

    actions = _by_soonest(needs_checkin) + _by_soonest(needs_attendance) + _by_soonest(needs_decision)

    return {
        "uid": uid,
        "needs_checkin": _by_soonest(needs_checkin),
        "needs_attendance": _by_soonest(needs_attendance),
        "needs_decision": _by_soonest(needs_decision),
        "coming_up": _by_soonest(coming_up),
        "waiting": _by_soonest(waiting),
        "waitlisted": _by_soonest(waitlisted),
        "settled": _by_soonest(settled),
        "action_count": len(actions),
        "reliability": get_reliability(uid),
        "is_trusted": is_trusted(uid),
        "profile_color": generate_user_color(uid),
    }


def activity_route():
    if "user" not in session:
        return redirect(url_for("login"))

    uid = session["user"].get("uid", "")
    view = activity_data(uid)
    if view is None:
        return redirect(url_for("login"))

    return render_template("activity.html", is_admin=is_admin(uid), **view)
