"""
Entry point for the Metz mobile API. Run this file (not the individual
route modules) to start the server:

    python mobile/backend/server.py

This deliberately does NOT duplicate any business logic — every route
module imports the exact same data.py / utils/models.py that the Flask
web app (templates + server-rendered HTML) already uses, and just exposes
it as JSON instead of HTML. One source of truth for meetings, users,
trust/moderation, tags, and account-status tiers, shared by the web app and
the React Native app.

Auth model mirrors the web app's: the client signs in against Firebase
(same API key/project), we register/lookup the user the same way
data.register_user() does, and from then on the client sends its uid in the
signed token (see utils/tokens.py), sent as `Authorization: Bearer <token>`
and verified on every request. The old "trust whatever uid the client sends"
model let anyone impersonate any user, including admins.
"""

import os
import sys

# Reuse the existing project's data layer instead of re-implementing it.
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, _ROOT)
# Let route modules do plain `from helpers import ...` regardless of cwd.
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv

load_dotenv(os.path.join(_ROOT, ".env"))

from flask import Flask, request, jsonify, render_template, make_response

from data import touch_last_online, is_banned, public_meeting, add_guest

from utils.security import rate_limit_exceeded, client_ip

from admin_routes import admin_bp
from auth_routes import auth_bp
from discover_routes import discover_bp
from meeting_routes import meeting_bp
from moderation_routes import moderation_bp
from inbox_routes import inbox_bp
from profile_routes import profile_bp

# Templates and static assets live at the repository root, shared with the web
# app, so the two services cannot end up serving different versions of the same
# policy. base.html only references url_for('static', ...) — no web-only
# endpoints — so these pages render here without pulling in the rest of it.
app = Flask(
    __name__,
    template_folder=os.path.join(_ROOT, "templates"),
    static_folder=os.path.join(_ROOT, "static"),
)

# base.html emits a CSRF meta tag for the web app's forms. This service has no
# forms and no session cookies — every call authenticates with a bearer token —
# so there is no token to mint and nothing for one to protect. Without this the
# shared template raises UndefinedError and the legal pages 500.
app.jinja_env.globals.setdefault("csrf_token", lambda: "")
app.register_blueprint(auth_bp)
app.register_blueprint(meeting_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(discover_bp)
app.register_blueprint(moderation_bp)
app.register_blueprint(inbox_bp)


# A wildcard CORS policy lets any website call this API with a user's token.
# Development keeps "*" for convenience; production needs an explicit list.
IS_PRODUCTION = os.environ.get("FLASK_ENV", "production").lower() != "development"
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("MOBILE_CORS_ORIGINS", "*").split(",") if o.strip()
]
if IS_PRODUCTION and ALLOWED_ORIGINS == ["*"]:
    raise RuntimeError(
        "MOBILE_CORS_ORIGINS must list the allowed origins in production "
        "(a wildcard would let any site call this API on a user's behalf)."
    )


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    if ALLOWED_ORIGINS == ["*"]:
        response.headers["Access-Control-Allow-Origin"] = "*"
    elif origin in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-User-Id"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    response.headers["X-Content-Type-Options"] = "nosniff"

    # This API carries session tokens, so it gets the same transport promise the
    # website makes: once a client has seen this, it refuses plain HTTP to this
    # host entirely, closing the window where a first request could be
    # downgraded and the Authorization header read off the wire.
    #
    # Production and already-secure only — sending it from a local HTTP dev
    # server would pin "https only" for localhost in a browser and be a
    # nuisance to undo.
    if IS_PRODUCTION and request.is_secure:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response


@app.route("/api/<path:_any>", methods=["OPTIONS"])
def cors_preflight(_any):
    return "", 204


@app.before_request
def update_last_online():
    from helpers import current_uid   # verified identity, not a raw header
    uid = current_uid()
    if uid:
        touch_last_online(uid)


@app.before_request
def block_banned_accounts():
    """A ban has to reach the phone, not just the website.

    screens/login.py refuses a banned account, but that check lived only in the
    web app: this API never looked, so banning someone stopped them using the
    site while they carried on in the app as though nothing had happened. Their
    existing token also stayed valid for its full 30 days, so even adding the
    check to /api/login alone would have left everyone already signed in
    untouched.

    Doing it here covers every authenticated route at once, including tokens
    issued before the ban. Unauthenticated traffic — login, signup, the legal
    pages, health — resolves to no uid and passes straight through.
    """
    from helpers import current_uid
    uid = current_uid()
    if uid and is_banned(uid):
        # Said plainly rather than as a generic 401: someone who has been
        # banned should be told that is what happened, not left thinking the
        # app is broken and filing support requests about it.
        return jsonify({
            "error": "This account has been suspended.",
            "banned": True,
        }), 403


def _legal(template):
    """Render one of the shared legal pages.

    Served from this API as well as the web app because the phone is what
    links to them: config.js falls back to the API host for WEB_BASE_URL, so
    the "privacy policy" and "terms of service" links under the login form
    resolved to this service and 404'd — the web app is not deployed.

    They are also a Play requirement. The store listing needs a privacy policy
    URL that opens without an account, and a reviewer follows it before the app
    is approved, so a dead link is a rejection rather than a cosmetic fault.
    """
    from datetime import date
    return render_template(
        template,
        updated=date.today().strftime("%d %B %Y"),
        contact_email=os.environ.get("CONTACT_EMAIL", "ytevil68@gmail.com"),
    )


@app.route("/privacy")
def privacy():
    return _legal("privacy.html")


@app.route("/terms")
def terms():
    return _legal("terms.html")


# ─── The share link ─────────────────────────────────────────────────────────
# An organiser posts /m/<id> to Instagram or a group chat and anyone tapping it
# gets the meeting on one page and can say they are coming, with no account.
#
# Lives on this service because it is the one that is deployed, and it is kept
# entirely separate from the web app: its own standalone template, no session,
# no CSRF, nothing shared but the data layer.

def _share_url(meeting_id):
    """Absolute, because it goes in og:url and into other people's messages."""
    return request.url_root.rstrip("/") + f"/m/{meeting_id}"


def _when_text(value):
    """"Tomorrow · 18:00" — friendlier than a bare timestamp on a poster."""
    from datetime import datetime, timedelta
    try:
        at = datetime.strptime(value, "%Y-%m-%d %H:%M")
    except (TypeError, ValueError):
        return value or ""
    today = datetime.now().date()
    delta = (at.date() - today).days
    if delta == 0:
        day = "Today"
    elif delta == 1:
        day = "Tomorrow"
    else:
        day = at.strftime("%a %-d %b") if os.name != "nt" else at.strftime("%a %d %b")
    return f"{day} · {at.strftime('%H:%M')}"


def _render_share(meeting_id, error="", joined=False):
    view = public_meeting(meeting_id)
    if not view:
        # One answer whether the meeting never existed, is awaiting review, or
        # was cancelled — a link should not become a way to probe for ids.
        return render_template("share_missing.html"), 404

    progress = 0
    if view["min_attendees"]:
        progress = min(100, round(view["attending"] / view["min_attendees"] * 100))

    return render_template(
        "share_meeting.html",
        m=view,
        when_text=_when_text(view["time"]),
        progress=progress,
        page_url=_share_url(meeting_id),
        join_url=f"/m/{meeting_id}/join",
        og_image=request.url_root.rstrip("/") + "/static/metz-og.png",
        error=error,
        joined=joined,
    )


@app.route("/m/<int:meeting_id>")
def share_meeting(meeting_id):
    # The cookie is not a login — it only stops the same browser being counted
    # twice and shows the person they are already down, since there is no way
    # to un-join.
    return _render_share(meeting_id, joined=request.cookies.get(f"metz_g{meeting_id}") == "1")


@app.route("/m/<int:meeting_id>/join", methods=["POST"])
def share_meeting_join(meeting_id):
    if request.cookies.get(f"metz_g{meeting_id}") == "1":
        return _render_share(meeting_id, joined=True)

    # Open to the whole internet with no account behind it, so it is the one
    # endpoint that needs a hard limit on how fast one host can call it.
    if rate_limit_exceeded("share-join:ip:" + client_ip(), 8, 3600):
        return _render_share(meeting_id, error="Too many sign-ups from here. Try again later."), 429

    name = (request.form.get("name") or "").strip()
    if not request.form.get("understood"):
        return _render_share(meeting_id, error="Please tick the box to confirm."), 400
    if not name:
        return _render_share(meeting_id, error="Please enter your name."), 400

    if not add_guest(meeting_id, name):
        return _render_share(
            meeting_id,
            error="Couldn't add you — this meeting may be full or already over.",
        ), 400

    response = make_response(_render_share(meeting_id, joined=True))
    response.set_cookie(
        f"metz_g{meeting_id}", "1",
        max_age=60 * 60 * 24 * 60, samesite="Lax",
        secure=IS_PRODUCTION, httponly=True,
    )
    return response


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    # Separate port from the Flask web app (5050) so both can run side by side.
    # Debug mode exposes the Werkzeug console (remote code execution for anyone
    # who can reach it), so it follows FLASK_ENV rather than being hard-coded.
    app.run(
        debug=not IS_PRODUCTION,
        host=os.environ.get("HOST", "127.0.0.1" if IS_PRODUCTION else "0.0.0.0"),
        port=int(os.environ.get("MOBILE_API_PORT", 5051)),
    )
