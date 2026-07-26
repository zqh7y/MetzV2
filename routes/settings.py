from flask import render_template, session, redirect, url_for
from data import get_user, generate_user_color, is_admin, is_trusted


def settings_route():
    """App preferences. The theme itself lives in the browser's localStorage
    (see base.html) — nothing about it needs to reach the server, so this
    route only renders the controls."""
    if "user" not in session:
        return redirect(url_for("login"))

    uid = session["user"].get("uid", "")
    email = session["user"].get("email", "")
    user = get_user(uid)

    return render_template(
        "settings.html",
        username=email.split("@")[0],
        email=email,
        uid=uid,
        profile_picture=user.get("profile_picture") if user else None,
        profile_color=generate_user_color(uid),
        is_admin=is_admin(uid),
        is_trusted=is_trusted(uid),
    )
