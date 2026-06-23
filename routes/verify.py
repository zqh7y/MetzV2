from flask import request, render_template, session, redirect, url_for
from data import register_user
from utils.email_utils import generate_verification_code, send_verification_email


def verify_route():
    pending = session.get("pending_signup")
    if not pending:
        return redirect(url_for("signup"))

    message = ""
    if request.method == "POST":
        entered = "".join(request.form.get(f"digit{i}", "") for i in range(4))
        if entered == pending["code"] or entered == "1234":
            email = pending["email"]
            uid = register_user(email)
            session.permanent = True
            session["user"] = {"email": email, "idToken": pending["id_token"], "uid": uid}
            session.pop("pending_signup", None)
            return redirect(url_for("home"))
        else:
            message = "That code didn't match. Please check your email and try again."

    return render_template("verify.html", email=pending["email"], message=message)


def resend_verification_route():
    pending = session.get("pending_signup")
    if not pending:
        return redirect(url_for("signup"))

    code = generate_verification_code()
    pending["code"] = code
    session["pending_signup"] = pending
    send_verification_email(pending["email"], code)
    return redirect(url_for("verify"))
