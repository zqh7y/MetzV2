import os
from flask import request, render_template, redirect, url_for, session
import requests
from data import register_user
from utils.auth_errors import friendly_auth_error
from utils.email_utils import generate_verification_code, send_verification_email

API_KEY = os.environ["FIREBASE_API_KEY"]


def signup_route():
    message = ""
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")

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
            }
            send_verification_email(email, code)
            return redirect(url_for("verify"))
        else:
            message = friendly_auth_error(data.get("error", {}).get("message"))

    return render_template("signup.html", message=message)
