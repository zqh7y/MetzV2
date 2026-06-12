import os
import uuid
from flask import request, render_template, session, redirect, url_for
from data import add_meeting
from functions.models import InPersonMeeting, OnlineMeeting, validate_meeting_data, sanitize_html


def parse_coord(value):
    """Parse a form field into a float, or return None if missing/invalid."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "styles", "uploads")


def save_meeting_image(file_storage):
    """Save an uploaded meeting image and return its static-relative path, or None."""
    if not file_storage or not file_storage.filename:
        return None
    ext = file_storage.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return None
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    file_storage.save(os.path.join(UPLOAD_DIR, filename))
    return f"uploads/{filename}"


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

        errors = validate_meeting_data(title, description, time, meeting_type,
                                       location_name=location_name, link=link)
        if errors:
            message = " | ".join(errors)
        else:
            title = sanitize_html(title)
            description = sanitize_html(description)
            uid = session["user"].get("uid", "")
            image = save_meeting_image(request.files.get("image"))

            if meeting_type == "inperson":
                lat = parse_coord(request.form.get("lat", ""))
                lng = parse_coord(request.form.get("lng", ""))
                new_meeting = InPersonMeeting(
                    id=0, title=title, description=description, time=time,
                    location=location_name, lat=lat, lng=lng, image=image,
                )
                add_meeting(new_meeting, creator_uid=uid)
                return redirect(url_for("home"))

            elif meeting_type == "online":
                new_meeting = OnlineMeeting(
                    id=0, title=title, description=description, time=time, link=link, image=image,
                )
                add_meeting(new_meeting, creator_uid=uid)
                return redirect(url_for("home"))

    return render_template("create.html", message=message)
