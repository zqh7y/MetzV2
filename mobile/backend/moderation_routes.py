"""Reporting and blocking.

App stores require both from anything carrying user-generated content: a way to
flag something for a human, and a way for someone to stop seeing a particular
person immediately, without waiting for that human.

The logic lives in data.py so the web app and the API cannot disagree about
what a report is or who is blocked.
"""

from flask import Blueprint, request, jsonify

from data import (
    REPORT_REASONS, add_report, block_user, unblock_user, get_blocked_uids,
    get_reports, resolve_report, open_report_count, get_user, is_admin,
)

from helpers import current_uid, require_admin

moderation_bp = Blueprint("moderation", __name__)


@moderation_bp.route("/api/report/reasons")
def report_reasons():
    """The reason list, so the client never hard-codes keys the server rejects."""
    return jsonify([{"id": key, "label": label} for key, label in REPORT_REASONS.items()])


@moderation_bp.route("/api/report", methods=["POST"])
def report():
    uid = current_uid()
    if not uid or not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(force=True) or {}
    result = add_report(
        uid,
        body.get("target_type", ""),
        body.get("target_id", ""),
        body.get("reason", ""),
        body.get("detail", ""),
    )
    if not result:
        return jsonify({"error": "Couldn't file that report. Check what you selected."}), 400

    # The reporter is not told whether this is their first report about the
    # thing or a duplicate — either way the honest answer is "it's with us".
    return jsonify({"status": "received", "id": result["id"]})


@moderation_bp.route("/api/block/<target_uid>", methods=["POST"])
def block(target_uid):
    uid = current_uid()
    if not uid or not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401
    if not block_user(uid, target_uid):
        return jsonify({"error": "Couldn't block that account."}), 400
    return jsonify({"status": "blocked", "blocked_uids": get_blocked_uids(uid)})


@moderation_bp.route("/api/block/<target_uid>", methods=["DELETE"])
def unblock(target_uid):
    uid = current_uid()
    if not uid or not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401
    unblock_user(uid, target_uid)
    return jsonify({"status": "unblocked", "blocked_uids": get_blocked_uids(uid)})


@moderation_bp.route("/api/blocked")
def blocked():
    """Who you have blocked — so Settings can show and undo it."""
    uid = current_uid()
    if not uid or not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    out = []
    for target in get_blocked_uids(uid):
        user = get_user(target) or {}
        out.append({"uid": target, "username": user.get("username", target)})
    return jsonify(out)


# ─── Admin ────────────────────────────────────────────────────────────────
@moderation_bp.route("/api/admin/reports")
def admin_reports():
    denied = require_admin()
    if denied:
        return denied

    status = request.args.get("status") or None
    rows = []
    for r in get_reports(status):
        reporter = get_user(r["reporter_uid"]) or {}
        rows.append({
            **r,
            "reason_label": REPORT_REASONS.get(r["reason"], r["reason"]),
            "reporter_username": reporter.get("username", r["reporter_uid"]),
        })
    return jsonify({"reports": rows, "open_count": open_report_count()})


@moderation_bp.route("/api/admin/reports/<int:report_id>", methods=["POST"])
def admin_resolve(report_id):
    denied = require_admin()
    if denied:
        return denied

    action = (request.get_json(force=True) or {}).get("action", "")
    if not resolve_report(report_id, current_uid(), action):
        return jsonify({"error": "Couldn't update that report."}), 400
    return jsonify({"status": action, "open_count": open_report_count()})
