"""Admin moderation: reviewing, approving, and declining pending meetings —
mirrors screens/admin.py from the web app."""

from flask import Blueprint, jsonify

from data import get_all_meetings, approve_meeting, decline_meeting

from helpers import current_uid, require_admin, serialize_meeting

admin_bp = Blueprint("admin", __name__)


@admin_bp.route("/api/admin/pending")
def admin_pending():
    forbidden = require_admin()
    if forbidden:
        return forbidden
    uid = current_uid()
    pending = get_all_meetings(status="pending")
    return jsonify([serialize_meeting(m, uid) for m in pending])


@admin_bp.route("/api/admin/meetings/<int:meeting_id>/approve", methods=["POST"])
def admin_approve(meeting_id):
    if approve_meeting(meeting_id, current_uid()):
        return jsonify({"status": "approved"})
    return jsonify({"error": "forbidden"}), 403


@admin_bp.route("/api/admin/meetings/<int:meeting_id>/decline", methods=["POST"])
def admin_decline(meeting_id):
    if decline_meeting(meeting_id, current_uid()):
        return jsonify({"status": "declined"})
    return jsonify({"error": "forbidden"}), 403
