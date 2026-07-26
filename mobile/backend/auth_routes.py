"""Signup / email-verify / login — same Firebase project and verification
flow as the web app's screens/signup.py, screens/verify.py, screens/login.py,
just returning JSON instead of redirecting."""

import hmac
import os
import time

import requests
from flask import Blueprint, request, jsonify

from data import register_user
from utils.auth_errors import friendly_auth_error
from utils.email_utils import generate_verification_code, send_verification_email
from utils.security import rate_limit_exceeded, client_ip
from utils.tokens import issue_token

from helpers import FIREBASE_API_KEY, PENDING_SIGNUPS

DEV_MODE = os.environ.get("FLASK_ENV", "production").lower() == "development"
CODE_TTL_SECONDS = 15 * 60
MAX_CODE_ATTEMPTS = 6

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/api/signup", methods=["POST"])
def signup():
    body = request.get_json(force=True) or {}
    email = body.get("email", "")
    password = body.get("password", "")

    if rate_limit_exceeded("api-signup:ip:" + client_ip(), 5, 3600):
        return jsonify({"error": "Too many sign-up attempts. Please try again later."}), 429

    payload = {"email": email, "password": password, "returnSecureToken": True}
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={FIREBASE_API_KEY}"
    resp = requests.post(url, json=payload)
    fb_data = resp.json()

    if "idToken" not in fb_data:
        return jsonify({"error": friendly_auth_error(fb_data.get("error", {}).get("message"))}), 400

    code = generate_verification_code()
    PENDING_SIGNUPS[email] = {
        "id_token": fb_data["idToken"],
        "code": code,
        "issued_at": time.time(),
        "attempts": 0,
    }
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

    if time.time() - pending.get("issued_at", 0) > CODE_TTL_SECONDS:
        PENDING_SIGNUPS.pop(email, None)
        return jsonify({"error": "That code has expired. Please sign up again."}), 400

    pending["attempts"] = pending.get("attempts", 0) + 1
    if pending["attempts"] > MAX_CODE_ATTEMPTS:
        PENDING_SIGNUPS.pop(email, None)
        return jsonify({"error": "Too many incorrect codes. Please sign up again."}), 429

    # "1234" used to be accepted from anyone, which made email verification
    # optional for every account. It is a development convenience only.
    matched = hmac.compare_digest(str(entered_code), str(pending["code"]))
    if DEV_MODE and entered_code == "1234":
        matched = True
    if not matched:
        return jsonify({"error": "That code didn't match."}), 400

    uid = register_user(email)
    PENDING_SIGNUPS.pop(email, None)
    return jsonify({"uid": uid, "email": email, "token": issue_token(uid)})


@auth_bp.route("/api/verify/resend", methods=["POST"])
def resend_verify():
    body = request.get_json(force=True) or {}
    email = body.get("email", "")
    pending = PENDING_SIGNUPS.get(email)
    if not pending:
        return jsonify({"error": "No pending signup for that email."}), 400
    if rate_limit_exceeded("api-resend:ip:" + client_ip(), 5, 3600):
        return jsonify({"error": "Too many codes requested. Please wait a while."}), 429

    code = generate_verification_code()
    pending["code"] = code
    pending["issued_at"] = time.time()
    pending["attempts"] = 0
    send_verification_email(email, code)
    return jsonify({"status": "sent"})


@auth_bp.route("/api/login", methods=["POST"])
def login():
    body = request.get_json(force=True) or {}
    email = body.get("email", "")
    password = body.get("password", "")

    if (rate_limit_exceeded("api-login:ip:" + client_ip(), 15, 300)
            or rate_limit_exceeded("api-login:acct:" + email.lower(), 6, 300)):
        return jsonify({"error": "Too many sign-in attempts. Please wait a few minutes."}), 429

    payload = {"email": email, "password": password, "returnSecureToken": True}
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
    resp = requests.post(url, json=payload)
    fb_data = resp.json()

    if "idToken" not in fb_data:
        return jsonify({"error": friendly_auth_error(fb_data.get("error", {}).get("message"))}), 400

    uid = register_user(email)
    return jsonify({"uid": uid, "email": email, "token": issue_token(uid)})
