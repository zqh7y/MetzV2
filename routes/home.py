from flask import render_template, request, session, redirect, url_for
from data import (get_all_meetings, sort_meetings_by_distance, register_user, get_user, is_admin,
                  is_trusted, get_joined_users_preview, shorten_address, client_meeting_dict,
                  next_up_meeting, meeting_phase, seconds_until_start, MEETINGS_DB)
from utils.models import AVAILABLE_TAGS

# How many suggestions the "For You" shelf holds before the user has to scroll
# the full list below it.
FOR_YOU_LIMIT = 12


def home_route():
    # Home used to register and sign in a throwaway "test@example.com" user
    # for anyone arriving without a session, which meant the whole app was
    # reachable without logging in. Visitors go to the login page instead.
    if "user" not in session:
        return redirect(url_for("login"))

    if not get_user(session["user"].get("uid", "")):
        # Session survived a server restart but the persisted user record
        # didn't (e.g. a stale cookie from an earlier database).
        uid = register_user(session["user"]["email"])
        session["user"]["uid"] = uid

    email_full = session["user"]["email"]
    username = email_full.split("@")[0]

    meetings = get_all_meetings(status="approved")

   # Sort by distance when browser sends coordinates
    try:
        user_lat = float(request.args.get("lat", ""))
        user_lng = float(request.args.get("lng", ""))
        meetings = sort_meetings_by_distance(meetings, user_lat, user_lng)
    except (ValueError, TypeError):
        pass

    uid = session["user"].get("uid", "")

    # "For You" shelf: everything the user hasn't joined or passed on yet.
    # Same candidates the old swipe deck used (joining also marks a meeting as
    # swiped), minus the user's own meetings — no point suggesting those.
    user = get_user(uid)
    swiped_ids = user["swiped_ids"] if user else []
    for_you = [m for m in meetings if m.id not in swiped_ids and m.creator_uid != uid][:FOR_YOU_LIMIT]

    joined_previews = {m.id: get_joined_users_preview(m.joined_uids) for m in meetings}
    short_locations = {m.id: shorten_address(getattr(m, "location", None)) for m in meetings}
    trusted_map = {m.creator_uid: is_trusted(m.creator_uid) for m in meetings if m.creator_uid}

    meetings_json = []
    for m in meetings:
        # client_meeting_dict, not to_dict: an online meeting's join link must
        # not travel to a browser whose user hasn't joined it.
        d = client_meeting_dict(m, uid)
        d["joined_preview"] = joined_previews[m.id]
        d["short_location"] = short_locations[m.id]
        d["creator_is_trusted"] = trusted_map.get(m.creator_uid, False)
        meetings_json.append(d)

    current_user_avatar = get_joined_users_preview([uid])[0] if uid else None
    pending_notice = request.args.get("pending") == "1"

    # The reminder strip at the top of the sheet: whatever this user committed
    # to next, counting down, so a join can't be quietly forgotten.
    next_up = next_up_meeting(uid)
    next_up_info = None
    if next_up:
        record = MEETINGS_DB.get(next_up.id, {})
        next_up_info = {
            "meeting": next_up,
            "phase": meeting_phase(record),
            "seconds": seconds_until_start(record),
            "short_location": shorten_address(getattr(next_up, "location", "")),
            "is_online": bool(getattr(next_up, "link", "")),
        }

    return render_template(
        "home.html", email=username, meetings=meetings, meetings_json=meetings_json,
        for_you=for_you, uid=uid, is_admin=is_admin(uid), joined_previews=joined_previews,
        current_user_avatar=current_user_avatar, short_locations=short_locations,
        available_tags=AVAILABLE_TAGS, trusted_map=trusted_map, pending_notice=pending_notice,
        next_up=next_up_info,
    )
