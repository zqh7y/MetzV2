from datetime import datetime, timezone
from flask import render_template, session, redirect, url_for, abort
from data import get_user, generate_user_color


def _format_timestamp(iso_str):
    """Turn an ISO timestamp into a friendly 'X ago' / date string."""
    if not iso_str:
        return "Unknown"
    try:
        dt = datetime.fromisoformat(iso_str)
    except ValueError:
        return "Unknown"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    delta = now - dt
    seconds = delta.total_seconds()

    if seconds < 60:
        relative = "Just now"
    elif seconds < 3600:
        mins = int(seconds // 60)
        relative = f"{mins} minute{'s' if mins != 1 else ''} ago"
    elif seconds < 86400:
        hours = int(seconds // 3600)
        relative = f"{hours} hour{'s' if hours != 1 else ''} ago"
    else:
        days = int(seconds // 86400)
        relative = f"{days} day{'s' if days != 1 else ''} ago"

    return f"{relative} ({dt.strftime('%b %d, %Y')})"


def profile_route():
    if "user" not in session:
        return redirect(url_for("login"))

    uid = session["user"].get("uid", "")
    email = session["user"].get("email", "")
    username = email.split("@")[0]

    user = get_user(uid)
    if user:
        meetings_created = len(user["created_meeting_ids"])
        meetings_joined = len(user["joined_meeting_ids"])
        meetings_swiped = len(user["swiped_ids"])
        profile_picture = user.get("profile_picture")
    else:
        meetings_created = meetings_joined = meetings_swiped = 0
        profile_picture = None

    return render_template(
        "profile.html",
        username=username,
        email=email,
        uid=uid,
        profile_picture=profile_picture,
        profile_color=generate_user_color(uid),
        meetings_created=meetings_created,
        meetings_joined=meetings_joined,
        meetings_swiped=meetings_swiped,
    )


def user_profile_route(uid):
    if "user" not in session:
        return redirect(url_for("login"))

    user = get_user(uid)
    if not user:
        abort(404)

    return render_template(
        "user_profile.html",
        username=user["username"],
        uid=uid,
        profile_picture=user.get("profile_picture"),
        profile_color=generate_user_color(uid),
        meetings_created=len(user.get("created_meeting_ids", [])),
        meetings_joined=len(user.get("joined_meeting_ids", [])),
        meetings_swiped=len(user.get("swiped_ids", [])),
        joined_at=_format_timestamp(user.get("joined_at")),
        last_online=_format_timestamp(user.get("last_online")),
    )
