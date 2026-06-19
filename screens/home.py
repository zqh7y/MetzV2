from flask import render_template, request, session, redirect, url_for
from data import get_all_meetings, sort_meetings_by_distance, register_user, get_user, is_admin, is_trusted, get_joined_users_preview, shorten_address
from functions.models import AVAILABLE_TAGS


def home_route():
    if "user" not in session:
        uid = register_user("test@example.com")
        session["user"] = {"email": "test@example.com", "uid": uid}
    elif not get_user(session["user"].get("uid", "")):
        # Session survived a server restart but the in-memory/persisted user
        # record didn't (e.g. stale cookie from before app_data.json existed).
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
    joined_previews = {m.id: get_joined_users_preview(m.joined_uids) for m in meetings}
    short_locations = {m.id: shorten_address(getattr(m, "location", None)) for m in meetings}
    trusted_map = {m.creator_uid: is_trusted(m.creator_uid) for m in meetings if m.creator_uid}

    meetings_json = []
    for m in meetings:
        d = m.to_dict()
        d["joined_preview"] = joined_previews[m.id]
        d["short_location"] = short_locations[m.id]
        d["creator_is_trusted"] = trusted_map.get(m.creator_uid, False)
        meetings_json.append(d)

    current_user_avatar = get_joined_users_preview([uid])[0] if uid else None
    pending_notice = request.args.get("pending") == "1"

    return render_template(
        "home.html", email=username, meetings=meetings, meetings_json=meetings_json,
        uid=uid, is_admin=is_admin(uid), joined_previews=joined_previews,
        current_user_avatar=current_user_avatar, short_locations=short_locations,
        available_tags=AVAILABLE_TAGS, trusted_map=trusted_map, pending_notice=pending_notice,
    )
