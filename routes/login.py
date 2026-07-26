import os
from flask import request, render_template, session, redirect, url_for
import requests
from data import register_user, is_banned
from utils.auth_errors import friendly_auth_error
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
            uid = register_user(email)
            if is_banned(uid):
                return render_template("login.html", message="This account has been banned.")
            session.permanent = True
            session["user"] = {"email": email, "idToken": data["idToken"], "uid": uid}
            return redirect(url_for("home"))
        else:
            message = friendly_auth_error(data.get("error", {}).get("message"))

    return render_template("login.html", message=message)
