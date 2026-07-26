from datetime import datetime, timezone
from flask import render_template, session, redirect, url_for, abort
from flask import request
from data import (get_user, generate_user_color, is_admin, is_trusted, set_trusted,
                  get_account_status, get_all_meetings, get_joined_users_preview, shorten_address,
                  update_profile, PROFILE_EMOJIS, MAX_DISPLAY_NAME, MAX_BIO)


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


def _parse_time(time_str):
    try:
        return datetime.strptime(time_str, "%Y-%m-%d %H:%M")
    except (ValueError, TypeError):
        return None


def _joined_meetings(uid, user):
    """Split the meetings a user joined into upcoming and past, newest first.
    Powers the "My Meetings" block that replaced the standalone /joined page."""
    joined_ids = user["joined_meeting_ids"] if user else []
    all_meetings = {m.id: m for m in get_all_meetings()}
    joined = [all_meetings[mid] for mid in joined_ids if mid in all_meetings]

    parsed_times = {m.id: _parse_time(m.time) for m in joined}
    now = datetime.now()
    joined.sort(key=lambda m: parsed_times[m.id] or datetime.max)

    upcoming = [m for m in joined if parsed_times[m.id] and parsed_times[m.id] >= now]
    past = [m for m in joined if not parsed_times[m.id] or parsed_times[m.id] < now]

    return {
        "upcoming": upcoming,
        "past": past,
        "trusted_map": {m.creator_uid: is_trusted(m.creator_uid) for m in joined if m.creator_uid},
        "joined_previews": {m.id: get_joined_users_preview(m.joined_uids) for m in joined},
        "short_locations": {m.id: shorten_address(getattr(m, "location", None)) for m in joined},
    }


def profile_route():
    if "user" not in session:
        return redirect(url_for("login"))

    uid = session["user"].get("uid", "")
    email = session["user"].get("email", "")

    user = get_user(uid)
    username = (user.get("display_name") if user else None) or email.split("@")[0]
    if user:
        meetings_created = len(user["created_meeting_ids"])
        meetings_joined = len(user["joined_meeting_ids"])
        meetings_swiped = len(user["swiped_ids"])
        profile_picture = user.get("profile_picture")
        bio = user.get("bio", "")
        avatar_emoji = user.get("avatar_emoji", "")
    else:
        meetings_created = meetings_joined = meetings_swiped = 0
        profile_picture = None
        bio = ""
        avatar_emoji = ""

    joined = _joined_meetings(uid, user)

    return render_template(
        "profile.html",
        username=username,
        email=email,
        uid=uid,
        **joined,
        profile_picture=profile_picture,
        bio=bio,
        avatar_emoji=avatar_emoji,
        profile_color=generate_user_color(uid),
        meetings_created=meetings_created,
        meetings_joined=meetings_joined,
        meetings_swiped=meetings_swiped,
        is_trusted=is_trusted(uid),
        is_admin=is_admin(uid),
        account_status=get_account_status(uid),
    )


def user_profile_route(uid):
    if "user" not in session:
        return redirect(url_for("login"))

    user = get_user(uid)
    if not user:
        abort(404)

    viewer_uid = session["user"].get("uid", "")

    return render_template(
        "user_profile.html",
        username=user.get("display_name") or user["username"],
        uid=uid,
        bio=user.get("bio", ""),
        avatar_emoji=user.get("avatar_emoji", ""),
        profile_picture=user.get("profile_picture"),
        profile_color=generate_user_color(uid),
        meetings_created=len(user.get("created_meeting_ids", [])),
        meetings_joined=len(user.get("joined_meeting_ids", [])),
        meetings_swiped=len(user.get("swiped_ids", [])),
        joined_at=_format_timestamp(user.get("joined_at")),
        last_online=_format_timestamp(user.get("last_online")),
        is_trusted=is_trusted(uid),
        viewer_is_admin=is_admin(viewer_uid),
        account_status=get_account_status(uid),
    )


def toggle_trust_route(uid):
    """Admin-only: toggle a user's trusted status."""
    admin_uid = session.get("user", {}).get("uid", "")
    user = get_user(uid)
    if not user:
        abort(404)
    set_trusted(uid, not is_trusted(uid), admin_uid)
    return redirect(url_for("user_profile", uid=uid))


def edit_profile_route():
    """Let a user change the parts of their profile that are theirs to change.
    Validation and escaping happen in data.update_profile()."""
    if "user" not in session:
        return redirect(url_for("login"))

    uid = session["user"].get("uid", "")
    user = get_user(uid)
    if not user:
        return redirect(url_for("login"))

    message = ""
    if request.method == "POST":
        update_profile(
            uid,
            display_name=request.form.get("display_name", ""),
            bio=request.form.get("bio", ""),
            avatar_emoji=request.form.get("avatar_emoji", ""),
        )
        return redirect(url_for("profile", saved=1))

    return render_template(
        "edit_profile.html",
        uid=uid,
        email=session["user"].get("email", ""),
        display_name=user.get("display_name") or "",
        username=user.get("username", ""),
        bio=user.get("bio", ""),
        avatar_emoji=user.get("avatar_emoji", ""),
        profile_color=generate_user_color(uid),
        emoji_choices=PROFILE_EMOJIS,
        max_name=MAX_DISPLAY_NAME,
        max_bio=MAX_BIO,
        message=message,
        is_admin=is_admin(uid),
        is_trusted=is_trusted(uid),
    )
