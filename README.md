# Metz 🤝

Metz is a web app that helps people in your city discover, create, and join
local meetups — in person or online. Think of it as a lightweight mix between
a dating-app "swipe" interface and an event board: meetings show up as cards
on a map and in a swipe deck, and you join the ones you like.

It was built as a school project for the Software Engineering track at
**Holtz Metz**, using **Flask** for the backend and **Firebase Authentication**
for user accounts.

---

## ✨ Features

- **Email/password authentication** via Firebase Identity Toolkit, with
  friendly, human-readable error messages (no raw `INVALID_LOGIN_CREDENTIALS`
  strings shown to users).
- **Email verification flow** — after signing up, a 4-digit code is sent to
  the user's email before their account is activated.
- **Interactive map home screen** — meetings are shown as pins on a Leaflet
  map, sorted by distance from the user, with an info panel that slides up
  when a meeting is selected.
- **Swipe to discover** — a Tinder-style card deck (`/swipe`) lets users pass
  or join meetings with simple swipe gestures and buttons.
- **Create meetings** — users can create either:
  - 📍 **In-person meetings** (with a real location picked on the map), or
  - 📹 **Online meetings** (with a join link).
- **Joined meetings list** — see everything you've joined or created, with
  relative time labels ("in 2 hours", "starting now", "3 days ago").
- **User profiles** — search for other users ("People"), view their profile,
  see their joined/created meetings, and get a unique color-coded avatar
  generated from their username.
- **Admin accounts** — a small set of admin emails can delete any meeting,
  not just their own.
- **Persistent storage** — meetings, users, and joins are saved to
  `app_data.json` so data survives server restarts.

---

## 🏗️ Project structure

```
meetupApp/
├── app.py                  # Flask app + route definitions
├── data.py                 # In-memory + JSON-backed data layer (users, meetings)
├── firebase_config.py      # Firebase Admin SDK initialization
├── app_data.json           # Persisted meetings/users (auto-generated)
│
├── screens/                # One module per "screen", each exposing a *_route()
│   ├── login.py
│   ├── signup.py
│   ├── verify.py           # Email verification (4-digit code)
│   ├── home.py             # Map + meeting list
│   ├── swipe.py            # Swipe/discover deck
│   ├── create.py           # Create a new meeting
│   ├── joined.py           # Joined meetings, join/pass/delete actions
│   └── profile.py          # Own profile + other users' profiles
│
├── functions/
│   ├── models.py           # Meeting / InPersonMeeting / OnlineMeeting classes
│   ├── auth_errors.py      # Firebase error code → friendly message mapping
│   └── email_utils.py      # Verification code generation + email sending
│
├── templates/              # Jinja2 HTML templates (one per screen + base.html)
├── styles/
│   ├── style.css           # All app styling
│   ├── home.js              # Map logic, info panel, geolocation
│   ├── swipe.js             # Swipe deck interactions
│   ├── time-utils.js        # Relative time formatting ("in 2 hours")
│   ├── validation.js        # Client-side form validation
│   └── uploads/             # User-uploaded meeting cover images
│
└── .gitignore
```

---

## 🧩 How it's built

### Flask app entry point

The whole app is wired up in [`app.py`](app.py) — each route just delegates
to a `*_route()` function in `screens/`, keeping `app.py` as a clean routing
table:

```python
app = Flask(__name__, static_folder="styles")
app.secret_key = "supersecretkey123"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)

@app.route("/login", methods=["GET", "POST"])
def login():
    return login_route()

@app.route("/signup", methods=["GET", "POST"])
def signup():
    return signup_route()

@app.route("/verify", methods=["GET", "POST"])
def verify():
    return verify_route()

@app.route("/")
def home():
    return home_route()

@app.route("/swipe")
def swipe():
    return swipe_route()
```

### Authentication with Firebase

Signup and login talk directly to the **Firebase Identity Toolkit REST API**.
Raw Firebase error codes (like `EMAIL_EXISTS` or `INVALID_PASSWORD`) are
translated into friendly messages with [`functions/auth_errors.py`](functions/auth_errors.py):

```python
_FRIENDLY_MESSAGES = {
    "EMAIL_EXISTS": "An account with this email already exists. Try logging in instead.",
    "INVALID_PASSWORD": "Incorrect password. Please try again.",
    "WEAK_PASSWORD": "Your password is too weak — it must be at least 6 characters.",
    "TOO_MANY_ATTEMPTS_TRY_LATER": "Too many attempts. Please wait a few minutes and try again.",
    # ...
}

def friendly_auth_error(raw_message):
    if not raw_message:
        return "Something went wrong. Please try again."
    code = raw_message.split(":")[0].strip()
    return _FRIENDLY_MESSAGES.get(code, "Something went wrong. Please check your details and try again.")
```

### Email verification

After a successful Firebase signup, the user **isn't logged in immediately**.
Instead, a random 4-digit code is generated, emailed via Gmail SMTP, and
stored in the session under `pending_signup`. The user must enter it on
`/verify` before their account is activated:

```python
if "idToken" in data:
    code = generate_verification_code()
    session["pending_signup"] = {
        "email": email,
        "id_token": data["idToken"],
        "code": code,
    }
    send_verification_email(email, code)
    return redirect(url_for("verify"))
```

If Gmail credentials (`GMAIL_ADDRESS` / `GMAIL_APP_PASSWORD`) aren't set as
environment variables, the code is simply printed to the server console —
handy for local development.

### Meeting model — polymorphism in action

Meetings come in two flavors, both inheriting from a shared `Meeting` base
class. Each subclass overrides `get_display_text()` and `to_dict()` to add
its own fields ([`functions/models.py`](functions/models.py)):

```python
class Meeting:
    def get_display_text(self):
        return f"{self.title} – {self.time}"

class InPersonMeeting(Meeting):
    def __init__(self, id, title, description, time, location, lat, lng, ...):
        super().__init__(...)
        self.location = location
        self.lat = lat
        self.lng = lng

    def get_display_text(self):
        return f"[📍] {self.title} at {self.location} – {self.time}"

class OnlineMeeting(Meeting):
    def __init__(self, id, title, description, time, link, ...):
        super().__init__(...)
        self.link = link

    def get_display_text(self):
        return f"[📹] {self.title} – join at {self.link} – {self.time}"
```

### Two-stage input validation

Meeting creation is validated **twice**: once client-side in
[`styles/validation.js`](styles/validation.js) for instant feedback, and
again server-side in [`functions/models.py`](functions/models.py) so the
server never trusts the browser:

```python
def validate_meeting_data(title, description, time, meeting_type, location_name=None, link=None):
    errors = []

    if not title or not title.strip():
        errors.append("Title is required.")
    elif len(title) > MAX_TITLE_LEN:
        errors.append(f"Title must be at most {MAX_TITLE_LEN} characters.")

    if meeting_type == "inperson":
        if not location_name or not location_name.strip():
            errors.append("Location is required for in-person meetings.")
    elif meeting_type == "online":
        if not link.startswith(("http://", "https://")):
            errors.append("Link must start with http:// or https://")

    return errors
```

User-submitted text is also passed through `sanitize_html()` (using Python's
`html.escape`) before being stored, to prevent XSS.

### Data persistence

There's no external database — [`data.py`](data.py) keeps everything in
memory (`MEETINGS_DB`, `USERS_DB`) and writes it out to `app_data.json`
on every change, then reloads it on startup. This keeps the project simple
enough for a school assignment while still surviving server restarts.

---

## 🚀 Running locally

1. **Install dependencies** (Flask, requests, firebase-admin):
   ```bash
   pip install -r requirements.txt   # or install flask, requests, firebase-admin manually
   ```

2. **Add your Firebase service account key** as `metz-firebase.json` in the
   project root (this file is git-ignored for security — you'll need your
   own from the Firebase console).

3. *(Optional)* set up email sending by exporting:
   ```bash
   export GMAIL_ADDRESS="your-email@gmail.com"
   export GMAIL_APP_PASSWORD="your-app-password"
   ```
   Without these, verification codes are printed to the console instead of emailed.

4. **Run the app**:
   ```bash
   python app.py
   ```
   The app runs on **http://localhost:5050** by default.

---

## 🗺️ Main routes

| Route | Description |
|---|---|
| `/login`, `/signup` | Authentication screens |
| `/verify`, `/verify/resend` | Email verification code entry |
| `/` | Home — map view of nearby meetings |
| `/swipe` | Swipe deck to discover meetings |
| `/create` | Create a new in-person or online meeting |
| `/joined` | Meetings the user has joined or created |
| `/join/<id>`, `/pass/<id>`, `/delete/<id>` | Join, pass, or delete a meeting |
| `/profile`, `/user/<uid>` | Your profile / another user's profile |
| `/search_users?q=...` | Search for users by name |

---

## 📚 Notes

- This is a **school project** — the Flask secret key, in-memory database,
  and admin email list are intentionally simple and **not production-ready**.
- A development shortcut: during signup verification, the code **`1234`**
  is always accepted in addition to the real generated code, so the flow can
  be tested without email access.
