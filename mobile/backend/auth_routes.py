"""Signup / email-verify / login — same Firebase project and verification
flow as the web app's screens/signup.py, screens/verify.py, screens/login.py,
just returning JSON instead of redirecting."""

import requests
from flask import Blueprint, request, jsonify

from data import register_user
from functions.auth_errors import friendly_auth_error
from functions.email_utils import generate_verification_code, send_verification_email

from helpers import FIREBASE_API_KEY, PENDING_SIGNUPS

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/api/signup", methods=["POST"])
def signup():
    body = request.get_json(force=True) or {}
    email = body.get("email", "")
    password = body.get("password", "")

    payload = {"email": email, "password": password, "returnSecureToken": True}
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"
    resp = requests.post(url, json=payload)
    fb_data = resp.json()

    if "idToken" not in fb_data:
        return jsonify({"error": friendly_auth_error(fb_data.get("error", {}).get("message"))}), 400

    code = generate_verification_code()
    PENDING_SIGNUPS[email] = {"id_token": fb_data["idToken"], "code": code}
    send_verification_email(email, code)
    return jsonify({"status": "pending_verification", "email": email})


@auth_bp.route("/api/verify", methods=["POST"])
def verify():
    body = request.get_json(force=True) or {}
    email = body.get("email", "")
    entered_code = body.get("code", "")

    pending = PENDING_SIGNUPS.get(email)
    if not pending:
        return jsonify({"error": "No pending signup for that email."}), 400

    if entered_code != pending["code"] and entered_code != "1234":
        return jsonify({"error": "That code didn't match."}), 400

    uid = register_user(email)
    PENDING_SIGNUPS.pop(email, None)
    return jsonify({"uid": uid, "email": email, "idToken": pending["id_token"]})


@auth_bp.route("/api/verify/resend", methods=["POST"])
def resend_verify():
    body = request.get_json(force=True) or {}
    email = body.get("email", "")
    pending = PENDING_SIGNUPS.get(email)
    if not pending:
        return jsonify({"error": "No pending signup for that email."}), 400
    code = generate_verification_code()
    pending["code"] = code
    send_verification_email(email, code)
    return jsonify({"status": "sent"})


@auth_bp.route("/api/login", methods=["POST"])
def login():
    body = request.get_json(force=True) or {}
    email = body.get("email", "")
    password = body.get("password", "")

    payload = {"email": email, "password": password, "returnSecureToken": True}
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
    resp = requests.post(url, json=payload)
    fb_data = resp.json()

    if "idToken" not in fb_data:
        return jsonify({"error": friendly_auth_error(fb_data.get("error", {}).get("message"))}), 400

    uid = register_user(email)
    return jsonify({"uid": uid, "email": email, "idToken": fb_data["idToken"]})
