"""Password reset.

Firebase holds the passwords, so it also runs the reset: sendOobCode mails a
one-time link and hosts the new-password form. Minting our own reset tokens
would mean inventing a recovery path for credentials this app never stores.

Until this existed, forgetting a password meant losing the account outright —
there was no route, on either client, back into it.
"""

import os

import requests
from flask import render_template, request

from utils.security import rate_limit_exceeded, client_ip

API_KEY = os.environ["FIREBASE_API_KEY"]

# One address cannot be mail-bombed; one host cannot walk a list of addresses.
MAX_PER_EMAIL = 3
MAX_PER_IP = 10
WINDOW_SECONDS = 3600

TOO_MANY = "Too many reset requests. Please wait a while and try again."

# Shown whether or not the address is registered. Confirming which emails have
# accounts would let a stranger test who is a member.
SENT = ("If that email has an account, a reset link is on its way. "
        "Check your inbox, and your spam folder.")


def forgot_route():
    message = ""
    sent = False

    if request.method == "POST":
        email = (request.form.get("email") or "").strip()

        if not email:
            return render_template("forgot.html", message="Enter your email address.")

        if (rate_limit_exceeded("forgot:email:" + email.lower(), MAX_PER_EMAIL, WINDOW_SECONDS)
                or rate_limit_exceeded("forgot:ip:" + client_ip(), MAX_PER_IP, WINDOW_SECONDS)):
            return render_template("forgot.html", message=TOO_MANY), 429

        url = f"https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key={API_KEY}"
        try:
            requests.post(url, json={"requestType": "PASSWORD_RESET", "email": email}, timeout=10)
        except requests.RequestException:
            return render_template(
                "forgot.html",
                message="Couldn't reach the mail service. Try again shortly.",
            ), 502

        # Firebase's EMAIL_NOT_FOUND is swallowed on purpose — see SENT.
        sent = True

    return render_template("forgot.html", message=message, sent=sent)
