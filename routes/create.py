from flask import request, render_template, session, redirect, url_for
from data import add_meeting, is_trusted
from utils.models import InPersonMeeting, OnlineMeeting, validate_meeting_data, sanitize_html, AVAILABLE_TAGS


def parse_coord(value):
    """Parse a form field into a float, or return None if missing/invalid."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def create_route():
    if "user" not in session:
        return redirect(url_for("login"))

    message = ""
    if request.method == "POST":
        title = request.form.get("title", "")
        description = request.form.get("description", "")
        time = request.form.get("time", "")
        meeting_type = request.form.get("type", "")
        location_name = request.form.get("location_name", "")
        link = request.form.get("link", "")
        emoji = request.form.get("emoji", "").strip()
        tags = [t for t in request.form.getlist("tags") if t in AVAILABLE_TAGS]

        errors = validate_meeting_data(title, description, time, meeting_type,
                                       location_name=location_name, link=link)
        if errors:
            message = " | ".join(errors)
        else:
            title = sanitize_html(title)
            description = sanitize_html(description)
            uid = session["user"].get("uid", "")

            if meeting_type == "inperson":
                lat = parse_coord(request.form.get("lat", ""))
                lng = parse_coord(request.form.get("lng", ""))
                new_meeting = InPersonMeeting(
                    id=0, title=title, description=description, time=time,
                    location=location_name, lat=lat, lng=lng, emoji=emoji, tags=tags,
                )
                add_meeting(new_meeting, creator_uid=uid)
                return redirect(url_for("home", pending=0 if is_trusted(uid) else 1))

            elif meeting_type == "online":
                new_meeting = OnlineMeeting(
                    id=0, title=title, description=description, time=time, link=link, emoji=emoji, tags=tags,
                )
                add_meeting(new_meeting, creator_uid=uid)
                return redirect(url_for("home", pending=0 if is_trusted(uid) else 1))

    return render_template("create.html", message=message, available_tags=AVAILABLE_TAGS)
