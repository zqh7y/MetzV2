"""Private system and moderation inbox for the mobile client."""

from flask import Blueprint, jsonify
from data import get_user, get_inbox_messages, mark_inbox_read, mark_all_inbox_read, unread_inbox_count
from helpers import current_uid

inbox_bp = Blueprint("inbox", __name__)

def _uid_or_401():
    uid = current_uid()
    return uid if uid and get_user(uid) else None

@inbox_bp.route("/api/inbox")
def inbox():
    uid = _uid_or_401()
    if not uid:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({"messages": get_inbox_messages(uid), "unread_count": unread_inbox_count(uid)})

@inbox_bp.route("/api/inbox/<int:message_id>/read", methods=["POST"])
def read_message(message_id):
    uid = _uid_or_401()
    if not uid:
        return jsonify({"error": "unauthorized"}), 401
    if not mark_inbox_read(uid, message_id):
        return jsonify({"error": "not found"}), 404
    return jsonify({"unread_count": unread_inbox_count(uid)})

@inbox_bp.route("/api/inbox/read-all", methods=["POST"])
def read_all():
    uid = _uid_or_401()
    if not uid:
        return jsonify({"error": "unauthorized"}), 401
    mark_all_inbox_read(uid)
    return jsonify({"unread_count": unread_inbox_count(uid)})
