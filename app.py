import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

from flask import Flask, session, redirect, url_for, request, jsonify
from data import search_users, touch_last_online, is_admin, get_all_meetings, is_banned
from routes.login import login_route
from routes.signup import signup_route
from routes.home import home_route
from routes.create import create_route
from routes.swipe import swipe_route
from routes.joined import joined_route, pass_route, join_route, delete_route
from routes.profile import profile_route, user_profile_route, toggle_trust_route
from routes.verify import verify_route, resend_verification_route
from routes.admin import pending_route, approve_route, decline_route, dashboard_route, ban_route, delete_user_route

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET_KEY"]  # Required for session

# Keep users logged in across browser restarts.
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)


@app.before_request
def update_last_online():
    if "user" in session:
        uid = session["user"].get("uid", "")
        if is_banned(uid):
            session.pop("user", None)
            return redirect(url_for("login"))
        touch_last_online(uid)


@app.context_processor
def inject_nav_notifications():
    """Makes the pending-review count available to nav.html on every page,
    so admins see a notification dot without each route wiring it through."""
    uid = session.get("user", {}).get("uid", "")
    count = len(get_all_meetings(status="pending")) if is_admin(uid) else 0
    return {"nav_pending_count": count}


@app.route("/login", methods=["GET", "POST"])
def login():
    return login_route()


@app.route("/signup", methods=["GET", "POST"])
def signup():
    return signup_route()


@app.route("/verify", methods=["GET", "POST"])
def verify():
    return verify_route()


@app.route("/verify/resend")
def verify_resend():
    return resend_verification_route()


@app.route("/")
def home():
    return home_route()


@app.route("/create", methods=["GET", "POST"])
def create():
    return create_route()


@app.route("/swipe")
def swipe():
    return swipe_route()


@app.route("/joined")
def joined():
    return joined_route()


@app.route("/pass/<int:meeting_id>", methods=["POST"])
def pass_meeting(meeting_id):
    return pass_route(meeting_id)


@app.route("/join/<int:meeting_id>", methods=["POST"])
def join_meeting(meeting_id):
    return join_route(meeting_id)


@app.route("/delete/<int:meeting_id>", methods=["POST"])
def delete_meeting_route(meeting_id):
    return delete_route(meeting_id)


@app.route("/profile")
def profile():
    return profile_route()


@app.route("/user/<uid>")
def user_profile(uid):
    return user_profile_route(uid)


@app.route("/admin/trust/<uid>", methods=["POST"])
def admin_trust(uid):
    return toggle_trust_route(uid)


@app.route("/admin/pending")
def admin_pending():
    return pending_route()


@app.route("/admin/dashboard")
def admin_dashboard():
    return dashboard_route()


@app.route("/admin/ban/<uid>", methods=["POST"])
def admin_ban(uid):
    return ban_route(uid)


@app.route("/admin/delete_user/<uid>", methods=["POST"])
def admin_delete_user(uid):
    return delete_user_route(uid)


@app.route("/admin/approve/<int:meeting_id>", methods=["POST"])
def admin_approve(meeting_id):
    return approve_route(meeting_id)


@app.route("/admin/decline/<int:meeting_id>", methods=["POST"])
def admin_decline(meeting_id):
    return decline_route(meeting_id)


@app.route("/search_users")
def search_users_route():
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify([])
    return jsonify(search_users(q))


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))


if __name__ == "__main__":
    app.run(debug=True, port=5050, host="0.0.0.0")
