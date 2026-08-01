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

from flask import Flask, request, jsonify

from data import touch_last_online

from admin_routes import admin_bp
from auth_routes import auth_bp
from discover_routes import discover_bp
from meeting_routes import meeting_bp
from moderation_routes import moderation_bp
from inbox_routes import inbox_bp
from profile_routes import profile_bp

app = Flask(__name__)
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
