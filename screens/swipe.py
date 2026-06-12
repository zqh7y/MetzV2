from flask import render_template, session, redirect, url_for
from data import get_all_meetings, get_user, is_admin


def swipe_route():
    if "user" not in session:
        return redirect(url_for("login"))

    uid = session["user"].get("uid", "")
    user = get_user(uid)
    swiped_ids = user["swiped_ids"] if user else []

    meetings = get_all_meetings()
    to_show = [m for m in meetings if m.id not in swiped_ids]

    return render_template("swipe.html", meetings=to_show, uid=uid, is_admin=is_admin(uid))
