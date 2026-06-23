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
- **Interest tags** — meetings can be labeled with tags (Sports, Food & Drink,
  Study, Music, Art, Tech, Outdoors, Gaming, Social, Fitness). The home page
  has a filter bar to narrow meetings down by **type** (All / In-Person /
  Online) and by any combination of tags.
- **Trust & moderation system** — only **trusted users** and admins can post
  a meeting that goes live instantly. Everyone else's meetings are submitted
  as **pending** and only appear once an admin approves them from the
  **Review Pending Meetings** screen (`/admin/pending`). Trusted users get an
  animated, color-cycling ★ badge shown next to their name everywhere it
  appears (home cards, map info panel, swipe cards, joined list, profiles,
  people search).
- **Account status tiers** — a small gamification layer on the profile page:
  🧭 Explorer → 🎨 Creator → 🤝 Connector → 🌟 Organizer → 🛠️ Developer
  (admin-granted). Each tier shows a live checklist of what's left to unlock
  it (e.g. "Create 3 meetings", "Get 15 people to join your meetings").
- **Admin notifications** — admins see a pulsing notification dot on the
  Profile nav icon and a bold "Review Pending Meetings" button (with a live
  count badge) whenever there's something waiting for review.
- **Marker clustering** — on the home map, nearby meeting pins collapse into
  a single numbered circle as you zoom out, instead of cluttering the map
  with overlapping markers.
- **Admin accounts** — a small set of admin emails can delete any meeting,
  approve/decline pending ones, and mark other users as trusted.
- **Persistent storage** — meetings, users, and joins are saved to
  `app_data.json` so data survives server restarts.
- **React Native mobile app** (in [`mobile/`](mobile/)) — an Expo app that
  talks to a JSON API sharing the exact same `data.py`/`utils/models.py`
  logic as the web app, so meetings, trust/moderation, tags, and
  account-status tiers stay in sync across both. The mobile UI mirrors the
  web app's design (same gradients, cards, and a custom floating bottom tab
  bar) and adds a people-search tab to Discover for finding other users by
  username/email/ID. See [`mobile/README.md`](mobile/README.md) for details,
  including how to get the interactive map working via an EAS development
  build (Expo Go alone can't render `react-native-maps`).
- **Shared three-font system** — Poppins for headings/brand, Inter for body
  text, and Space Grotesk for buttons/stats/numbers, applied consistently
  across both the web app ([`static/style.css`](static/style.css)) and the
  mobile app ([`mobile/app/src/styles/fonts.js`](mobile/app/src/styles/fonts.js)).

---

## 🏗️ Project structure

```
meetupApp/
├── app.py                  # Flask app + route definitions
├── data.py                 # In-memory + JSON-backed data layer (users, meetings)
├── firebase_config.py      # Firebase Admin SDK initialization
├── app_data.json           # Persisted meetings/users (auto-generated)
├── .env.example             # Template for required environment variables
│
├── routes/                  # One module per route group, each exposing a *_route()
│   ├── login.py
│   ├── signup.py
│   ├── verify.py           # Email verification (4-digit code)
│   ├── home.py             # Map + meeting list + tag/type filters
│   ├── swipe.py            # Swipe/discover deck
│   ├── create.py           # Create a new meeting
│   ├── joined.py           # Joined meetings, join/pass/delete actions
│   ├── profile.py          # Own profile, other users' profiles, trust toggle
│   └── admin.py            # Pending-meeting review (approve/decline)
│
├── utils/
│   ├── models.py           # Meeting / InPersonMeeting / OnlineMeeting classes,
│   │                       # AVAILABLE_TAGS, meeting status (approved/pending)
│   ├── auth_errors.py      # Firebase error code → friendly message mapping
│   └── email_utils.py      # Verification code generation + email sending
│
├── templates/              # Jinja2 HTML templates (one per route + base.html)
│   └── pending.html         # Admin pending-meeting review page
├── static/                  # Flask's static folder
│   ├── style.css           # All app styling
│   ├── home.js              # Map logic, clustering, info panel, geolocation
│   ├── swipe.js             # Swipe deck interactions
│   ├── time-utils.js        # Relative time formatting ("in 2 hours")
│   ├── validation.js        # Client-side form validation
│   └── uploads/             # User-uploaded meeting cover images
│
├── mobile/                  # React Native (Expo) app + JSON API backend
│   ├── backend/             # Flask API reusing data.py/utils/ as-is
│   └── app/                 # Expo app (Login, Home, Create, Joined, Profile...)
│       └── src/
│           ├── components/  # Shared UI: AuthLayout, MeetingCard, CustomTabBar, MapMarker...
│           ├── screens/     # One screen per app/src/screens/*.js, mirrors web routes
│           └── styles/      # fonts.js — Poppins/Inter/Space Grotesk font names
│
└── .gitignore
```

---

## 🧩 How it's built

### Flask app entry point

The whole app is wired up in [`app.py`](app.py) — each route just delegates
to a `*_route()` function in `routes/`, keeping `app.py` as a clean routing
table:

```python
load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET_KEY"]
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
translated into friendly messages with [`utils/auth_errors.py`](utils/auth_errors.py):

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
its own fields ([`utils/models.py`](utils/models.py)):

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
[`static/validation.js`](static/validation.js) for instant feedback, and
again server-side in [`utils/models.py`](utils/models.py) so the
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

### Trust & moderation

Every meeting has a `status` of `"approved"` or `"pending"`. When a meeting
is created, [`data.add_meeting()`](data.py) checks whether the creator is
trusted (or an admin — admins are always implicitly trusted):

```python
if creator_uid and creator_uid in USERS_DB:
    meeting_obj.status = "approved" if is_trusted(creator_uid) else "pending"
```

Only **approved** meetings show up on the home/swipe/joined screens
(`get_all_meetings(status="approved")`). Admins review everything still
`"pending"` on [`/admin/pending`](templates/pending.html) and either
`approve_meeting()` or `decline_meeting()` (which just deletes it) —
both guarded by `is_admin()`.

### Account status tiers

[`data.get_account_status()`](data.py) walks a fixed list of tiers
(`ACCOUNT_TIERS`), each with its own requirements (meetings created, total
participants across your meetings, or — for the admin-only **Developer**
tier — being granted admin access). It returns the user's current tier plus
a progress checklist for the next one, which the profile page renders as a
live checklist with progress bars:

```python
ACCOUNT_TIERS = [
    {"id": "explorer", "name": "Explorer", "emoji": "🧭", "requires": []},
    {"id": "creator", "name": "Creator", "emoji": "🎨",
     "requires": [{"label": "Create 3 meetings", "key": "created", "target": 3}]},
    # ...connector, organizer...
    {"id": "developer", "name": "Developer", "emoji": "🛠️", "manual": True,
     "requires": [{"label": "Be granted admin access by the team", "key": "admin", "target": 1}]},
]
```

### Data persistence

There's no external database — [`data.py`](data.py) keeps everything in
memory (`MEETINGS_DB`, `USERS_DB`) and writes it out to `app_data.json`
on every change, then reloads it on startup. This keeps the project simple
enough for a school assignment while still surviving server restarts.

---

## 🚀 Running locally

1. **Install dependencies** (Flask, requests, firebase-admin, python-dotenv):
   ```bash
   pip install -r requirements.txt
   ```

2. **Add your Firebase service account key** as `metz-firebase.json` in the
   project root (this file is git-ignored for security — you'll need your
   own from the Firebase console).

3. **Create a `.env` file** from the template and fill it in:
   ```bash
   cp .env.example .env
   ```
   - `FLASK_SECRET_KEY` — any long random string (used to sign session cookies).
   - `FIREBASE_API_KEY` — your Firebase project's Web API key.
   - `GMAIL_ADDRESS` / `GMAIL_APP_PASSWORD` — *(optional)* for sending real
     verification emails. Without these, verification codes are printed to
     the console instead.

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
| `/admin/pending` | Admin: review meetings awaiting approval |
| `/admin/approve/<id>`, `/admin/decline/<id>` | Admin: approve or decline a pending meeting |
| `/admin/trust/<uid>` | Admin: toggle a user's trusted status |

---

## 📚 Notes

- This is a **school project** — the in-memory database and admin email list
  are intentionally simple and **not production-ready**. Secrets (Flask
  session key, Firebase Web API key) live in a gitignored `.env` file rather
  than in source — see [`.env.example`](.env.example) for what's needed.
- A development shortcut: during signup verification, the code **`1234`**
  is always accepted in addition to the real generated code, so the flow can
  be tested without email access.
- The [`mobile/`](mobile/) React Native app and its JSON API are a separate,
  parallel client on top of the same `data.py` — see
  [`mobile/README.md`](mobile/README.md) for how to run and test it
  (including testing on a physical Android phone via Expo Go).
