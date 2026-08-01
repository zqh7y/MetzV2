"""Explore — browse and filter every open meeting.

Home is a map, which is good for "what is near me" and bad for everything
else: you cannot ask it for "study sessions this week" or "anything online".
This is the list view of the same data, with the filters the map cannot offer.

Filtering happens server-side so a shared or bookmarked URL reproduces the
same view, rather than the state living only in the page's JavaScript.
"""

from flask import render_template, request, session, redirect, url_for

from data import (
    get_all_meetings, get_user, is_admin, is_trusted, shorten_address, filter_blocked,
    seconds_until_start, get_joined_users_preview, MEETINGS_DB,
)
from utils.models import AVAILABLE_TAGS

DAY = 24 * 3600

WHEN_FILTERS = {
    "any": None,
    "today": DAY,
    "week": 7 * DAY,
    "month": 30 * DAY,
}

SORTS = ("soonest", "popular", "newest")


def explore_data(uid, q="", kind="all", tag="", when="any", sort="soonest", hide_joined=False):
    """The filtered, sorted rows plus the tags worth offering.

    Split out from the route so the mobile API can serve the same view from the
    same code. Both clients then agree on what "this week" means and how
    "popular" orders — which they would not if each filtered its own copy.
    """
    if when not in WHEN_FILTERS:
        when = "any"
    if sort not in SORTS:
        sort = "soonest"

    q = (q or "").strip()
    window = WHEN_FILTERS[when]
    needle = q.lower()

    rows = []
    for meeting in filter_blocked(uid, get_all_meetings(status="approved")):
        m = MEETINGS_DB.get(meeting.id, {})
        online = bool(getattr(meeting, "link", ""))
        secs = seconds_until_start(m)
        joined = uid in meeting.joined_uids

        if kind == "online" and not online:
            continue
        if kind == "inperson" and online:
            continue
        if tag and tag not in (meeting.tags or []):
            continue
        if hide_joined and joined:
            continue
        # A window always means "still to come", so anything already started
        # drops out — "today" should not surface this morning's meeting.
        if window is not None and (secs is None or secs < 0 or secs > window):
            continue
        if needle and needle not in " ".join([
            meeting.title or "", meeting.description or "",
            getattr(meeting, "location", "") or "", meeting.creator_username or "",
        ]).lower():
            continue

        rows.append({
            "id": meeting.id,
            "title": meeting.title,
            "description": meeting.description,
            "time": meeting.time,
            "emoji": meeting.emoji or "📍",
            "tags": meeting.tags or [],
            "is_online": online,
            "where": shorten_address(getattr(meeting, "location", "")) or ("Online" if online else ""),
            "creator_username": meeting.creator_username,
            "creator_uid": meeting.creator_uid,
            "creator_is_trusted": is_trusted(meeting.creator_uid) if meeting.creator_uid else False,
            "joined_count": len(meeting.joined_uids),
            "joined_preview": get_joined_users_preview(meeting.joined_uids),
            "is_joined": joined,
            "has_threshold": bool(int(m.get("min_attendees") or 0)),
            "min_attendees": int(m.get("min_attendees") or 0),
            # The model already knows how to work this out; the web page happens
            # not to draw a bar, but the mobile card does.
            "threshold_progress": meeting.threshold_progress,
            "spots_left": meeting.spots_left,
            "waitlist_count": len(m.get("waitlist_uids") or []),
            "commit_status": m.get("commit_status"),
            "created_at": m.get("created_at") or "",
            "seconds": secs,
        })

    if sort == "popular":
        rows.sort(key=lambda r: (-r["joined_count"], r["seconds"] is None, r["seconds"]))
    elif sort == "newest":
        rows.sort(key=lambda r: r["created_at"], reverse=True)
    else:
        rows.sort(key=lambda r: (r["seconds"] is None, r["seconds"]))

    # Only offer tags that actually match something, so the filter row never
    # leads to an empty page.
    live_tags = sorted({t for r in rows for t in r["tags"]} | ({tag} if tag else set()))

    return {
        "meetings": rows,
        "total": len(rows),
        "q": q, "kind": kind, "tag": tag, "when": when, "sort": sort,
        "hide_joined": hide_joined,
        "all_tags": [t for t in AVAILABLE_TAGS if t in live_tags],
    }


def explore_route():
    if "user" not in session:
        return redirect(url_for("login"))

    uid = session["user"].get("uid", "")
    if not get_user(uid):
        return redirect(url_for("login"))

    view = explore_data(
        uid,
        q=request.args.get("q") or "",
        kind=request.args.get("kind") or "all",     # all | inperson | online
        tag=request.args.get("tag") or "",
        when=request.args.get("when") or "any",
        sort=request.args.get("sort") or "soonest",
        hide_joined=request.args.get("hide_joined") == "1",
    )

    return render_template("explore.html", is_admin=is_admin(uid), **view)
