import os
import time
from flask import request, render_template, redirect, url_for, session
import requests
from data import register_user
from utils.auth_errors import friendly_auth_error
from utils.email_utils import generate_verification_code, send_verification_email
from utils.security import rate_limit_exceeded, client_ip

API_KEY = os.environ["FIREBASE_API_KEY"]

# Each signup sends an email, so an unlimited endpoint is also a way to use
# this app to spam other people's inboxes.
MAX_SIGNUPS_PER_IP = 5
WINDOW_SECONDS = 3600
TOO_MANY = "Too many sign-up attempts from this device. Please try again later."


def signup_route():
    message = ""
    if request.method == "POST":
        email = (request.form.get("email") or "").strip()
        password = request.form.get("password")

        if rate_limit_exceeded("signup:ip:" + client_ip(), MAX_SIGNUPS_PER_IP, WINDOW_SECONDS):
            return render_template("signup.html", message=TOO_MANY), 429

        payload = {"email": email, "password": password, "returnSecureToken": True}
        url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}"
        response = requests.post(url, json=payload)
        data = response.json()

        if "idToken" in data:
            code = generate_verification_code()
            session["pending_signup"] = {
                "email": email,
                "id_token": data["idToken"],
                "code": code,
                "issued_at": time.time(),   # codes expire, see routes/verify.py
                "attempts": 0,
            }
            send_verification_email(email, code)
            return redirect(url_for("verify"))
        else:
            message = friendly_auth_error(data.get("error", {}).get("message"))

    return render_template("signup.html", message=message)
