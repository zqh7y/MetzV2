import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

from flask import Flask, session, redirect, url_for, request, jsonify, render_template
from data import search_users, get_active_users, touch_last_online, is_admin, get_all_meetings, is_banned
from routes.login import login_route
from routes.signup import signup_route
from routes.home import home_route
from routes.create import create_route
from routes.meeting_actions import pass_route, join_route, delete_route, decide_route
from routes.profile import profile_route, user_profile_route, toggle_trust_route, edit_profile_route
from routes.settings import settings_route
from routes.verify import verify_route, resend_verification_route
from routes.admin import pending_route, approve_route, decline_route, dashboard_route, ban_route, delete_user_route

from utils.security import (
    csrf_protect, get_csrf_token, add_security_headers,
)

app = Flask(__name__)

# Anything other than "development" is treated as production: cookies get the
# Secure flag, debug is refused, and a weak secret key stops the app booting.
ENV = os.environ.get("FLASK_ENV", "production").lower()
IS_PRODUCTION = ENV != "development"

SECRET_KEY = os.environ["FLASK_SECRET_KEY"]  # Required for session
# The old hard-coded key leaked in this repo's git history, so refuse to run
# with it (or with anything else obviously guessable) in production.
_WEAK_KEYS = {"supersecretkey123", "replace-with-a-long-random-string", "secret", "changeme"}
if IS_PRODUCTION and (SECRET_KEY in _WEAK_KEYS or len(SECRET_KEY) < 32):
    raise RuntimeError(
        "FLASK_SECRET_KEY is weak or is a known-leaked value. Generate a new one, "
        "e.g. python -c \"import secrets; print(secrets.token_urlsafe(48))\""
    )

app.secret_key = SECRET_KEY

app.config.update(
    # Keep users logged in across browser restarts.
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
    # Session cookie hardening
    SESSION_COOKIE_HTTPONLY=True,      # not readable from JavaScript
    SESSION_COOKIE_SAMESITE="Lax",     # not sent on cross-site POSTs
    SESSION_COOKIE_SECURE=IS_PRODUCTION,   # HTTPS only once deployed
    # Refuse oversized request bodies (2 MB is plenty for these forms)
    MAX_CONTENT_LENGTH=2 * 1024 * 1024,
)

app.before_request(csrf_protect)
app.after_request(add_security_headers)


@app.context_processor
def inject_csrf_token():
    """Makes csrf_token() available to every template."""
    return {"csrf_token": get_csrf_token}


@app.errorhandler(404)
def not_found(_e):
    return render_template("error.html", code=404,
                           title="Page not found",
                           message="That page doesn't exist."), 404


@app.errorhandler(403)
def forbidden(_e):
    return render_template("error.html", code=403,
                           title="Not allowed",
                           message="You don't have permission to view this."), 403


@app.errorhandler(400)
def bad_request(_e):
    return render_template("error.html", code=400,
                           title="Bad request",
                           message="Something was wrong with that request. Try again."), 400


@app.errorhandler(500)
def server_error(_e):
    app.logger.exception("Unhandled error")
    return render_template("error.html", code=500,
                           title="Something broke",
                           message="Sorry — an unexpected error occurred."), 500


@app.route("/healthz")
def healthz():
    """Liveness probe for whatever ends up running this."""
    return jsonify({"status": "ok"})


@app.before_request
def update_last_online():
    if "user" in session:
        uid = session["user"].get("uid", "")
        if is_banned(uid):
            session.pop("user", None)
            return redirect(url_for("login"))
        touch_last_online(uid)


@app.context_processor
def inject_nav_notifications():
    """Makes the pending-review count available to nav.html on every page,
    so admins see a notification dot without each route wiring it through."""
    uid = session.get("user", {}).get("uid", "")
    count = len(get_all_meetings(status="pending")) if is_admin(uid) else 0
    return {"nav_pending_count": count}


@app.route("/login", methods=["GET", "POST"])
def login():
    return login_route()


@app.route("/signup", methods=["GET", "POST"])
def signup():
    return signup_route()


@app.route("/verify", methods=["GET", "POST"])
def verify():
    return verify_route()


@app.route("/verify/resend")
def verify_resend():
    return resend_verification_route()


@app.route("/")
def home():
    return home_route()


@app.route("/create", methods=["GET", "POST"])
def create():
    return create_route()


@app.route("/pass/<int:meeting_id>", methods=["POST"])
def pass_meeting(meeting_id):
    return pass_route(meeting_id)


@app.route("/join/<int:meeting_id>", methods=["POST"])
def join_meeting(meeting_id):
    return join_route(meeting_id)


@app.route("/meeting/<int:meeting_id>/decide", methods=["POST"])
def decide_meeting(meeting_id):
    return decide_route(meeting_id)


@app.route("/delete/<int:meeting_id>", methods=["POST"])
def delete_meeting_route(meeting_id):
    return delete_route(meeting_id)


@app.route("/profile")
def profile():
    return profile_route()


@app.route("/profile/edit", methods=["GET", "POST"])
def profile_edit():
    return edit_profile_route()


@app.route("/settings")
def settings():
    return settings_route()


@app.route("/user/<uid>")
def user_profile(uid):
    return user_profile_route(uid)


@app.route("/admin/trust/<uid>", methods=["POST"])
def admin_trust(uid):
    return toggle_trust_route(uid)


@app.route("/admin/pending")
def admin_pending():
    return pending_route()


@app.route("/admin/dashboard")
def admin_dashboard():
    return dashboard_route()


@app.route("/admin/ban/<uid>", methods=["POST"])
def admin_ban(uid):
    return ban_route(uid)


@app.route("/admin/delete_user/<uid>", methods=["POST"])
def admin_delete_user(uid):
    return delete_user_route(uid)


@app.route("/admin/approve/<int:meeting_id>", methods=["POST"])
def admin_approve(meeting_id):
    return approve_route(meeting_id)


@app.route("/admin/decline/<int:meeting_id>", methods=["POST"])
def admin_decline(meeting_id):
    return decline_route(meeting_id)


@app.route("/search_users")
def search_users_route():
    if "user" not in session:
        return jsonify({"error": "unauthorized"}), 401
    q = request.args.get("q", "").strip()
    if not q:
        # No query: show the community's most active members instead of nothing
        return jsonify(get_active_users(limit=12, exclude_uid=session["user"].get("uid", "")))
    return jsonify(search_users(q))


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))


if __name__ == "__main__":
    # Debug mode exposes the Werkzeug console, which is remote code execution
    # for anyone who can reach it — so it is opt-in via FLASK_ENV=development,
    # never the default. In production run a real WSGI server against wsgi.py
    # (see README) rather than this.
    app.run(
        debug=not IS_PRODUCTION,
        port=int(os.environ.get("PORT", 5050)),
        host=os.environ.get("HOST", "127.0.0.1" if IS_PRODUCTION else "0.0.0.0"),
    )
