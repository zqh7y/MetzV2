"""Explore and Activity for the mobile app.

Both views are computed by the same functions the web pages use
(routes/explore.py, routes/activity.py), so the two clients cannot disagree
about what "this week" covers, how "popular" sorts, or what counts as
something waiting on you. This module only translates between HTTP and those
functions — there is deliberately no filtering or sectioning logic here.
"""

from flask import Blueprint, request, jsonify

from routes.explore import explore_data
from routes.activity import activity_data

from helpers import current_uid

discover_bp = Blueprint("discover", __name__)


@discover_bp.route("/api/explore")
def explore():
    uid = current_uid()
    if not uid:
        return jsonify({"error": "unauthorized"}), 401

    return jsonify(explore_data(
        uid,
        q=request.args.get("q") or "",
        kind=request.args.get("kind") or "all",       # all | inperson | online
        tag=request.args.get("tag") or "",
        when=request.args.get("when") or "any",       # any | today | week | month
        sort=request.args.get("sort") or "soonest",   # soonest | popular | newest
        # Accepts "1" so the query string matches the web's, letting a link be
        # pasted between the two.
        hide_joined=request.args.get("hide_joined") == "1",
    ))


@discover_bp.route("/api/activity")
def activity():
    uid = current_uid()
    if not uid:
        return jsonify({"error": "unauthorized"}), 401

    view = activity_data(uid)
    if view is None:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify(view)
