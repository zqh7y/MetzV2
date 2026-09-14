"""Signup / login / logout for the app, against the same Firebase project the
web app uses, returning JSON instead of redirecting.

No email verification. The web app still has its code step; this one does not,
deliberately — see signup() for what that step was actually buying and what it
costs to drop it."""

import os

import requests
from flask import Blueprint, request, jsonify

from data import (
    register_user, uid_for_email, token_version, revoke_tokens,
    set_push_token, clear_push_token,
)
from utils.auth_errors import friendly_auth_error
from utils.security import rate_limit_exceeded, client_ip
from utils.tokens import issue_token

from helpers import FIREBASE_API_KEY, current_uid


auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/api/signup", methods=["POST"])
def signup():
    """Create the account and sign them straight in.

    There is no email verification step any more. It cost a code, a screen, a
    fifteen-minute window and a working mail provider, and what it bought was
    proof that the person owns the address they typed.

    What that proof was actually worth here: nothing in the app is sent to an
    address, nobody's email is shown to anybody else, and a password reset goes
    through Firebase, which mails the real owner regardless of what happened at
    signup. So the address being unproven costs the app nothing and costs a
    stranger nothing.

    What it does allow is squatting — signing up as an address you do not own,
    which leaves the real owner told "already in use" if they try later. That
    is recoverable through the reset, and it is the trade being made
    deliberately rather than by accident.
    """
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

    # Firebase holds the credentials; this is the Metz account beside them.
    uid = register_user(email)
    return jsonify({
        "uid": uid,
        "email": email,
        "token": issue_token(uid, token_version(uid)),
    })


@auth_bp.route("/api/push/token", methods=["POST"])
def save_push_token():
    """Remember where to push for the signed-in account.

    Sent by the app after it has a token, which is every launch — Expo can
    reissue one at any time, and a stale one is a device that silently stops
    hearing anything.
    """
    uid = current_uid()
    if not uid:
        return jsonify({"error": "unauthorized"}), 401
    token = (request.get_json(force=True) or {}).get("token", "")
    if not token:
        return jsonify({"error": "no token"}), 400
    set_push_token(uid, token)
    return jsonify({"status": "saved"})


@auth_bp.route("/api/push/token", methods=["DELETE"])
def drop_push_token():
    """Stop pushing to this account's devices — signing out.

    All of them rather than the one asking: the app drops its session at the
    same moment and cannot prove which token was its own afterwards, and
    leaving a stale one is how somebody keeps getting another person's
    notifications on a shared phone.
    """
    uid = current_uid()
    if uid:
        clear_push_token(uid)
    return jsonify({"status": "cleared"})


@auth_bp.route("/api/logout", methods=["POST"])
def logout():
    """End every session for the calling account, not just this device.

    Dropping the token on the phone is all the app could do on its own, and it
    only helps the person holding it. A token that was copied off a shared or
    stolen device stayed good for the rest of its month. Bumping the account's
    token version leaves every token ever issued for it refused at the door.

    Answers 200 even when the caller has no valid token: there is nothing to
    reveal either way, and an app that cannot log out because its token already
    expired would be stuck signed in on screen.
    """
    uid = current_uid()
    if uid:
        revoke_tokens(uid)
        # A device that is no longer signed in must stop hearing about it.
        clear_push_token(uid)
    return jsonify({"status": "logged_out"})


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


@auth_bp.route("/api/auth/google", methods=["POST"])
def google_sign_in():
    """Sign in (or sign up) with a Google account, skipping the emailed code.

    The client sends whichever token Google gave it. Firebase verifies that
    token against Google and tells us which address it belongs to — so this
    endpoint never has to trust the client about who it
    is. The address in the request body is deliberately ignored; accepting one
    would let anybody claim anybody's account by typing their email.

    No 4-digit code is involved because there is nothing left for it to prove.
    That code exists to establish that the person controls the address, and
    Google has already established exactly that. This is also why signing up
    this way works while the Gmail sender is misconfigured.
    """
    body = request.get_json(force=True) or {}
    id_token = (body.get("id_token") or "").strip()
    access_token = (body.get("access_token") or "").strip()

    # Which one arrives depends on the platform, not on the caller's choice.
    # Google's Android and iOS OAuth clients use the authorisation-code flow,
    # so the app ends up holding whatever the exchange returned; only the web
    # flow yields an id_token directly. Firebase's signInWithIdp accepts either
    # for google.com, so both are honoured rather than making the phone do a
    # flow Google does not offer it.
    if id_token:
        post_body = f"id_token={id_token}&providerId=google.com"
    elif access_token:
        post_body = f"access_token={access_token}&providerId=google.com"
    else:
        return jsonify({"error": "Missing Google credentials."}), 400

    if rate_limit_exceeded("api-google:ip:" + client_ip(), 20, 3600):
        return jsonify({"error": "Too many sign-in attempts. Please wait a few minutes."}), 429

    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key={FIREBASE_API_KEY}"
    payload = {
        # requestUri is required by the endpoint but unused for this grant;
        # Firebase only checks that it is present and well-formed.
        "postBody": post_body,
        "requestUri": "http://localhost",
        "returnSecureToken": True,
    }
    try:
        resp = requests.post(url, json=payload, timeout=15)
        fb_data = resp.json()
    except requests.RequestException:
        return jsonify({"error": "Couldn't reach Google. Please try again shortly."}), 502

    if "idToken" not in fb_data:
        return jsonify({"error": friendly_auth_error(fb_data.get("error", {}).get("message"))}), 400

    email = (fb_data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "That Google account has no email address."}), 400

    # Firebase reports what the provider said rather than assuming. Google only
    # issues tokens for verified addresses, so this should always pass — but
    # reading it keeps the guarantee explicit rather than inherited.
    verified = fb_data.get("emailVerified")
    if not (verified is True or str(verified).lower() == "true"):
        return jsonify({"error": "That Google account's email isn't verified."}), 403

    # Registering here is the one place outside /api/verify that may create an
    # account, and it is allowed for the same reason: the address is proven.
    uid = register_user(email)
    return jsonify({"uid": uid, "email": email, "token": issue_token(uid, token_version(uid))})


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

    # Firebase has already checked the password, so this address is theirs as
    # far as this app can tell. An account it has never seen before is made
    # here rather than refused: with verification gone there is no other step
    # that would create it, and refusing would lock out anybody who registered
    # with Firebase but never finished.
    uid = uid_for_email(email) or register_user(email)
    return jsonify({"uid": uid, "email": email, "token": issue_token(uid, token_version(uid))})
