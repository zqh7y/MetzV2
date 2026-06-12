from flask import render_template, request, session, redirect, url_for
from data import get_all_meetings, sort_meetings_by_distance, register_user, get_user, is_admin


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

    meetings = get_all_meetings()

   # Sort by distance when browser sends coordinates
    try:
        user_lat = float(request.args.get("lat", ""))
        user_lng = float(request.args.get("lng", ""))
        meetings = sort_meetings_by_distance(meetings, user_lat, user_lng)
    except (ValueError, TypeError):
        pass

    meetings_json = [m.to_dict() for m in meetings]

    uid = session["user"].get("uid", "")
    return render_template(
        "home.html", email=username, meetings=meetings, meetings_json=meetings_json,
        uid=uid, is_admin=is_admin(uid),
    ) 
