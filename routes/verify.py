import hmac
import os
import time

from flask import request, render_template, session, redirect, url_for
from data import register_user
from utils.email_utils import (
    generate_verification_code, send_verification_email, EmailNotSent,
)
from utils.security import rate_limit_exceeded, client_ip

# A 4-digit code is only 10,000 possibilities, so the number of guesses is the
# thing actually protecting it.
MAX_ATTEMPTS = 6
CODE_TTL_SECONDS = 15 * 60
MAX_RESENDS_PER_HOUR = 5

# The old code accepted "1234" from anyone, which let any signup skip email
# verification entirely. It now only works when explicitly developing.
DEV_MODE = os.environ.get("FLASK_ENV", "production").lower() == "development"
DEV_BYPASS_CODE = "1234"


def _expired(pending):
    issued = pending.get("issued_at", 0)
    return time.time() - issued > CODE_TTL_SECONDS


def verify_route():
    pending = session.get("pending_signup")
    if not pending:
        return redirect(url_for("signup"))

    message = ""
    if request.method == "POST":
        if rate_limit_exceeded("verify:ip:" + client_ip(), 20, 600):
            return render_template("verify.html", email=pending["email"],
                                   message="Too many attempts. Please wait a few minutes."), 429

        entered = "".join(request.form.get(f"digit{i}", "") for i in range(4))

        if _expired(pending):
            session.pop("pending_signup", None)
            return render_template("verify.html", email=pending["email"],
                                   message="That code has expired. Please sign up again.")

        attempts = pending.get("attempts", 0) + 1
        pending["attempts"] = attempts
        session["pending_signup"] = pending

        if attempts > MAX_ATTEMPTS:
            session.pop("pending_signup", None)
            return render_template("signup.html",
                                   message="Too many incorrect codes. Please sign up again.")

        # compare_digest keeps the check constant-time
        matched = hmac.compare_digest(entered, str(pending["code"]))
        if DEV_MODE and entered == DEV_BYPASS_CODE:
            matched = True

        if matched:
            email = pending["email"]
            uid = register_user(email)
            session.permanent = True
            session["user"] = {"email": email, "idToken": pending["id_token"], "uid": uid}
            session.pop("pending_signup", None)
            return redirect(url_for("home"))

        remaining = MAX_ATTEMPTS - attempts
        message = "That code didn't match. Please check your email and try again."
        if remaining <= 2:
            message += f" {remaining} attempt{'s' if remaining != 1 else ''} left."

    return render_template("verify.html", email=pending["email"], message=message)


def resend_verification_route():
    pending = session.get("pending_signup")
    if not pending:
        return redirect(url_for("signup"))

    if rate_limit_exceeded("resend:ip:" + client_ip(), MAX_RESENDS_PER_HOUR, 3600):
        return render_template("verify.html", email=pending["email"],
                               message="Too many codes requested. Please wait a while."), 429

    code = generate_verification_code()
    pending["code"] = code
    pending["issued_at"] = time.time()
    pending["attempts"] = 0
    session["pending_signup"] = pending
    try:
        send_verification_email(pending["email"], code)
    except EmailNotSent as exc:
        print(f"[Metz] verification resend failed for {pending['email']}: {exc}", flush=True)
        return render_template(
            "verify.html", email=pending["email"],
            message="We still couldn't send the code. Please try again shortly.",
        ), 502
    return redirect(url_for("verify"))
