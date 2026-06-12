from flask import request, render_template, session, redirect, url_for
import requests
from data import register_user
from functions.auth_errors import friendly_auth_error

API_KEY = (
    "AIzaSyCpYNaczgJeArlmH8qMVLcfMNm15a1jBiI"  # Replace with env variable in production
)


def login_route():
    message = ""
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")

        payload = {"email": email, "password": password, "returnSecureToken": True}
        url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}"
        response = requests.post(url, json=payload)
        data = response.json()

        if "idToken" in data:
            uid = register_user(email)
            session.permanent = True
            session["user"] = {"email": email, "idToken": data["idToken"], "uid": uid}
            return redirect(url_for("home"))
        else:
            message = friendly_auth_error(data.get("error", {}).get("message"))

    return render_template("login.html", message=message)
