"""
Entry point for the Metz mobile API. Run this file (not the individual
route modules) to start the server:

    python mobile/backend/server.py

This deliberately does NOT duplicate any business logic — every route
module imports the exact same data.py / functions/models.py that the Flask
web app (templates + server-rendered HTML) already uses, and just exposes
it as JSON instead of HTML. One source of truth for meetings, users,
trust/moderation, tags, and account-status tiers, shared by the web app and
the React Native app.

Auth model mirrors the web app's: the client signs in against Firebase
(same API key/project), we register/lookup the user the same way
data.register_user() does, and from then on the client sends its uid in the
X-User-Id header. We never re-verify the Firebase idToken signature here —
the original Flask app doesn't either (it just trusts session["user"]), so
this keeps the security model identical rather than inventing a new one.
"""

import os
import sys

# Reuse the existing project's data layer instead of re-implementing it.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
# Let route modules do plain `from helpers import ...` regardless of cwd.
sys.path.insert(0, os.path.dirname(__file__))

from flask import Flask, request, jsonify

from data import touch_last_online

from admin_routes import admin_bp
from auth_routes import auth_bp
from meeting_routes import meeting_bp
from profile_routes import profile_bp

app = Flask(__name__)
app.register_blueprint(auth_bp)
app.register_blueprint(meeting_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(admin_bp)


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-User-Id"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    return response


@app.route("/api/<path:_any>", methods=["OPTIONS"])
def cors_preflight(_any):
    return "", 204


@app.before_request
def update_last_online():
    uid = request.headers.get("X-User-Id", "")
    if uid:
        touch_last_online(uid)


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    # Separate port from the Flask web app (5050) so both can run side by side.
    app.run(debug=True, host="0.0.0.0", port=5051)
