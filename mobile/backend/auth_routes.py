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


@auth_bp.route("/api/password/reset", methods=["POST"])
def request_password_reset():
    """Send a password-reset email.

    Firebase owns the passwords, so it also owns the reset: sendOobCode mails a
    one-time link and handles the new-password form. Rolling our own would mean
    minting reset tokens for credentials this app never stores.

    The response is deliberately the same whether or not the address exists.
    Saying "no account with that email" turns this endpoint into a way to test
    whether somebody is a member, which is not something a stranger should be
    able to ask.
    """
    body = request.get_json(force=True) or {}
    email = (body.get("email") or "").strip()

    if not email:
        return jsonify({"error": "Enter your email address."}), 400

    # Two buckets: one stops a single address being mail-bombed, the other
    # stops one host walking a list of addresses.
    if (rate_limit_exceeded("api-reset:email:" + email.lower(), 3, 3600)
            or rate_limit_exceeded("api-reset:ip:" + client_ip(), 10, 3600)):
        return jsonify({"error": "Too many reset requests. Please try again later."}), 429

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key={FIREBASE_API_KEY}"
    try:
        requests.post(url, json={"requestType": "PASSWORD_RESET", "email": email}, timeout=10)
    except requests.RequestException:
        return jsonify({"error": "Couldn't reach the mail service. Try again shortly."}), 502

    # Firebase's own error (EMAIL_NOT_FOUND) is swallowed on purpose — see above.
    return jsonify({"status": "sent", "email": email})


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
