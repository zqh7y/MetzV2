from flask import render_template, session, redirect, url_for
from data import get_all_meetings, get_user, is_admin, is_trusted


def swipe_route():
    if "user" not in session:
        return redirect(url_for("login"))

    uid = session["user"].get("uid", "")
    user = get_user(uid)
    swiped_ids = user["swiped_ids"] if user else []

    meetings = get_all_meetings(status="approved")
    to_show = [m for m in meetings if m.id not in swiped_ids]
    trusted_map = {m.creator_uid: is_trusted(m.creator_uid) for m in to_show if m.creator_uid}

    return render_template("swipe.html", meetings=to_show, uid=uid, is_admin=is_admin(uid), trusted_map=trusted_map)
