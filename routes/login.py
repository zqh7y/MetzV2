import os
import time
from flask import request, render_template, session, redirect, url_for
import requests
from data import uid_for_email, is_banned
from utils.auth_errors import friendly_auth_error
from utils.email_utils import (
    generate_verification_code, send_verification_email, EmailNotSent,
)
from utils.security import rate_limit_exceeded, client_ip

API_KEY = os.environ["FIREBASE_API_KEY"]

# Password guessing is cheap without a limit. Per-IP catches one attacker
# spraying many accounts; per-account catches a botnet targeting one login.
MAX_ATTEMPTS_PER_IP = 15
MAX_ATTEMPTS_PER_ACCOUNT = 6
WINDOW_SECONDS = 300
TOO_MANY = "Too many sign-in attempts. Please wait a few minutes and try again."


def login_route():
    message = ""
    if request.method == "POST":
        email = (request.form.get("email") or "").strip()
        password = request.form.get("password")

        if (rate_limit_exceeded("login:ip:" + client_ip(), MAX_ATTEMPTS_PER_IP, WINDOW_SECONDS)
                or rate_limit_exceeded("login:acct:" + email.lower(),
                                       MAX_ATTEMPTS_PER_ACCOUNT, WINDOW_SECONDS)):
            return render_template("login.html", message=TOO_MANY), 429

        payload = {"email": email, "password": password, "returnSecureToken": True}
        url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}"
        response = requests.post(url, json=payload)
        data = response.json()

        if "idToken" in data:
            # Signing in must not create the account. screens/verify.py is what
            # turns a verified email into a Metz account; calling register_user
            # here as well made the code step optional — sign up, ignore the
            # email, log in with the same details and you were through.
            # By address, not by derived id — see data.uid_for_email.
            uid = uid_for_email(email)
            if not uid:
                # The password was right, so Firebase knows the address, but it
                # was never verified here. Refusing outright would strand them,
                # since signing up again only reports the address as taken — so
                # issue a fresh code and send them to the verify page.
                code = generate_verification_code()
                session["pending_signup"] = {
                    "email": email,
                    "id_token": data["idToken"],
                    "code": code,
                    "issued_at": time.time(),
                    "attempts": 0,
                }
                try:
                    send_verification_email(email, code)
                except EmailNotSent as exc:
                    print(f"[Metz] verification email failed for {email}: {exc}", flush=True)
                    return render_template(
                        "verify.html", email=email,
                        message="This account still needs verifying, and we couldn't "
                                "send the code just now. Use resend to try again.",
                    ), 502
                return render_template(
                    "verify.html", email=email,
                    message="This account hasn't been verified yet — we've sent you a new code.",
                )

            if is_banned(uid):
                return render_template("login.html", message="This account has been banned.")
            session.permanent = True
            session["user"] = {"email": email, "idToken": data["idToken"], "uid": uid}
            return redirect(url_for("home"))
        else:
            message = friendly_auth_error(data.get("error", {}).get("message"))

    return render_template("login.html", message=message)
