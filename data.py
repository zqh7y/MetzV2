import math
import hashlib
import json
import os
import pymysql
from datetime import datetime, timezone
from cryptography.fernet import Fernet
from utils.models import InPersonMeeting, OnlineMeeting

_fernet = Fernet(os.environ["DATA_ENCRYPTION_KEY"].encode())

# ── Global meetings store (all meetings, keyed by id) ──────────────────────────
# Starts empty — meetings only exist once a real user creates them.
MEETINGS_DB = {}
_next_meeting_id = 1

# ── In-memory user registry (persists while server is running) ────────────────
USERS_DB = {}

# Accounts with permission to delete any meeting, not just their own.
ADMIN_EMAILS = {"123@gmail.com", "1234@gmail.com", "test@gmail.com", "ytevil68@gmail.com"}


# ── Persistence: MySQL database, with each row's JSON content AES-encrypted ────
_LEGACY_JSON_FILE = os.path.join(os.path.dirname(__file__), "app_data.json")
_LEGACY_DB_FILE = os.path.join(os.path.dirname(__file__), "app_data.db")


def _get_connection():
    conn = pymysql.connect(
        host=os.environ.get("MYSQL_HOST", "127.0.0.1"),
        port=int(os.environ.get("MYSQL_PORT", 3306)),
        user=os.environ.get("MYSQL_USER", "root"),
        password=os.environ.get("MYSQL_PASSWORD", ""),
        database=os.environ.get("MYSQL_DATABASE", "metz_app"),
        autocommit=True,
    )
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS meetings (
                id INT PRIMARY KEY,
                data LONGBLOB NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                uid VARCHAR(64) PRIMARY KEY,
                data LONGBLOB NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS meta (
                `key` VARCHAR(64) PRIMARY KEY,
                value VARCHAR(255) NOT NULL
            )
        """)
    return conn


def save_data():
    """Write meetings, users, and the meeting id counter to the MySQL database.
    Each row's JSON content is AES-encrypted before being stored.
    Uses upserts (not delete-then-insert) so concurrent requests can't race
    into a duplicate-key error, then cleans up rows no longer present."""
    conn = _get_connection()
    with conn.cursor() as cur:
        if MEETINGS_DB:
            cur.executemany(
                "INSERT INTO meetings (id, data) VALUES (%s, %s) "
                "ON DUPLICATE KEY UPDATE data = VALUES(data)",
                [(mid, _fernet.encrypt(json.dumps(m).encode("utf-8"))) for mid, m in MEETINGS_DB.items()],
            )
            cur.execute(
                f"DELETE FROM meetings WHERE id NOT IN ({','.join(['%s'] * len(MEETINGS_DB))})",
                list(MEETINGS_DB.keys()),
            )
        else:
            cur.execute("DELETE FROM meetings")

        if USERS_DB:
            cur.executemany(
                "INSERT INTO users (uid, data) VALUES (%s, %s) "
                "ON DUPLICATE KEY UPDATE data = VALUES(data)",
                [(uid, _fernet.encrypt(json.dumps(u).encode("utf-8"))) for uid, u in USERS_DB.items()],
            )
            cur.execute(
                f"DELETE FROM users WHERE uid NOT IN ({','.join(['%s'] * len(USERS_DB))})",
                list(USERS_DB.keys()),
            )
        else:
            cur.execute("DELETE FROM users")

        cur.execute(
            "INSERT INTO meta (`key`, value) VALUES ('next_meeting_id', %s) "
            "ON DUPLICATE KEY UPDATE value = VALUES(value)",
            (str(_next_meeting_id),),
        )
    conn.close()


def _migrate_legacy_data():
    """One-time migration from the old encrypted app_data.json/app_data.db files into MySQL."""
    if os.path.exists(_LEGACY_JSON_FILE):
        with open(_LEGACY_JSON_FILE, "rb") as f:
            raw = f.read()
        try:
            return json.loads(_fernet.decrypt(raw).decode("utf-8"))
        except Exception:
            return json.loads(raw.decode("utf-8"))
    if os.path.exists(_LEGACY_DB_FILE):
        import sqlite3
        sconn = sqlite3.connect(_LEGACY_DB_FILE)
        meetings = {
            str(mid): json.loads(_fernet.decrypt(data).decode("utf-8"))
            for mid, data in sconn.execute("SELECT id, data FROM meetings")
        }
        users = {
            uid: json.loads(_fernet.decrypt(data).decode("utf-8"))
            for uid, data in sconn.execute("SELECT uid, data FROM users")
        }
        row = sconn.execute("SELECT value FROM meta WHERE key = 'next_meeting_id'").fetchone()
        sconn.close()
        return {"meetings": meetings, "users": users, "next_meeting_id": int(row[0]) if row else 1}
    return None


def load_data():
    """Load meetings, users, and the meeting id counter from the MySQL database.
    If the database is empty but an old app_data.json/app_data.db file exists,
    migrate it once."""
    global _next_meeting_id

    conn = _get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id, data FROM meetings")
        rows = cur.fetchall()
        for mid, data in rows:
            MEETINGS_DB[mid] = json.loads(_fernet.decrypt(data).decode("utf-8"))
        cur.execute("SELECT uid, data FROM users")
        for uid, data in cur.fetchall():
            USERS_DB[uid] = json.loads(_fernet.decrypt(data).decode("utf-8"))
        cur.execute("SELECT value FROM meta WHERE `key` = 'next_meeting_id'")
        row = cur.fetchone()
        if row:
            _next_meeting_id = int(row[0])
    conn.close()

    if not MEETINGS_DB and not USERS_DB:
        legacy = _migrate_legacy_data()
        if legacy:
            for mid, m in legacy.get("meetings", {}).items():
                MEETINGS_DB[int(mid)] = m
            USERS_DB.update(legacy.get("users", {}))
            _next_meeting_id = legacy.get("next_meeting_id", _next_meeting_id)
            save_data()


def get_all_meetings(status=None):
    """Return meetings as model objects, optionally filtered by status
    ("approved" or "pending")."""
    from utils.models import meeting_from_dict
    meetings = [meeting_from_dict(d) for d in MEETINGS_DB.values()]
    if status:
        meetings = [m for m in meetings if m.status == status]
    return meetings


def add_meeting(meeting_obj, creator_uid=None):
    """Add a meeting to MEETINGS_DB and record it on the creator's profile.

    Meetings from trusted users (and admins) go live immediately; everyone
    else's meetings start out "pending" until an admin approves them.
    """
    global _next_meeting_id
    meeting_obj.id = _next_meeting_id
    _next_meeting_id += 1
    if creator_uid and creator_uid in USERS_DB:
        meeting_obj.creator_uid = creator_uid
        meeting_obj.creator_username = USERS_DB[creator_uid]["username"]
        USERS_DB[creator_uid]["created_meeting_ids"].append(meeting_obj.id)
        meeting_obj.status = "approved" if is_trusted(creator_uid) else "pending"
    MEETINGS_DB[meeting_obj.id] = meeting_obj.to_dict()
    save_data()
    return meeting_obj


def approve_meeting(meeting_id, admin_uid):
    """Approve a pending meeting. Only admins may approve."""
    if not is_admin(admin_uid):
        return False
    m = MEETINGS_DB.get(meeting_id)
    if not m:
        return False
    m["status"] = "approved"
    save_data()
    return True


def decline_meeting(meeting_id, admin_uid):
    """Decline (= delete) a pending meeting. Only admins may decline."""
    if not is_admin(admin_uid):
        return False
    return delete_meeting(meeting_id, admin_uid)


def delete_meeting(meeting_id, uid):
    """Delete a meeting if the requester is its creator or an admin. Returns True if deleted."""
    m = MEETINGS_DB.get(meeting_id)
    if not m:
        return False
    if not can_delete_meeting(uid, m):
        return False
    creator_uid = m.get("creator_uid")
    if creator_uid and creator_uid in USERS_DB:
        ids = USERS_DB[creator_uid]["created_meeting_ids"]
        if meeting_id in ids:
            ids.remove(meeting_id)
    for u in USERS_DB.values():
        if meeting_id in u.get("joined_meeting_ids", []):
            u["joined_meeting_ids"].remove(meeting_id)
    del MEETINGS_DB[meeting_id]
    save_data()
    return True


def can_delete_meeting(uid, meeting):
    """A meeting can be deleted by its creator or by an admin."""
    if not uid:
        return False
    if is_admin(uid):
        return True
    return meeting.get("creator_uid") == uid


def toggle_join_meeting(uid, meeting_id):
    """Toggle a user's join on a meeting. Returns {"joined": bool, "count": int} or None."""
    m = MEETINGS_DB.get(meeting_id)
    user = USERS_DB.get(uid)
    if not m or not uid:
        return None
    joined_uids = m.setdefault("joined_uids", [])
    if uid in joined_uids:
        joined_uids.remove(uid)
        joined = False
        if user and meeting_id in user["joined_meeting_ids"]:
            user["joined_meeting_ids"].remove(meeting_id)
    else:
        joined_uids.append(uid)
        joined = True
        if user and meeting_id not in user["joined_meeting_ids"]:
            user["joined_meeting_ids"].append(meeting_id)
        if user and meeting_id not in user["swiped_ids"]:
            user["swiped_ids"].append(meeting_id)
    save_data()
    return {"joined": joined, "count": len(joined_uids)}


def is_admin(uid):
    user = USERS_DB.get(uid)
    return bool(user and user.get("is_admin"))


def get_total_participants(uid):
    """Total number of people who joined any meeting this user created."""
    user = USERS_DB.get(uid)
    if not user:
        return 0
    total = 0
    for mid in user.get("created_meeting_ids", []):
        m = MEETINGS_DB.get(mid)
        if m:
            total += len(m.get("joined_uids", []))
    return total


# ─── Account status tiers ───────────────────────────────────────────────────
# Each tier (besides the starting one) lists tasks a user must complete to
# unlock it. "manual" tiers can't be earned by stats alone — an admin has to
# grant them (e.g. Developer = actual app maintainers).
ACCOUNT_TIERS = [
    {
        "id": "explorer",
        "name": "Explorer",
        "emoji": "🧭",
        "blurb": "Just getting started around here.",
        "requires": [],
    },
    {
        "id": "creator",
        "name": "Creator",
        "emoji": "🎨",
        "blurb": "Brings new meetings to life.",
        "requires": [
            {"label": "Create 3 meetings", "key": "created", "target": 3},
        ],
    },
    {
        "id": "connector",
        "name": "Connector",
        "emoji": "🤝",
        "blurb": "Builds meetings people actually show up to.",
        "requires": [
            {"label": "Create 3 meetings", "key": "created", "target": 3},
            {"label": "Get 15 people to join your meetings", "key": "participants", "target": 15},
        ],
    },
    {
        "id": "organizer",
        "name": "Organizer",
        "emoji": "🌟",
        "blurb": "A pillar of the community.",
        "requires": [
            {"label": "Create 8 meetings", "key": "created", "target": 8},
            {"label": "Get 40 people to join your meetings", "key": "participants", "target": 40},
        ],
    },
    {
        "id": "developer",
        "name": "Developer",
        "emoji": "🛠️",
        "blurb": "Helps run Metz behind the scenes.",
        "requires": [
            {"label": "Be granted admin access by the team", "key": "admin", "target": 1},
        ],
        "manual": True,
    },
]


def get_account_status(uid):
    """Work out a user's current account-status tier and what's left to
    unlock the next one."""
    user = USERS_DB.get(uid)
    stats = {
        "created": len(user.get("created_meeting_ids", [])) if user else 0,
        "participants": get_total_participants(uid),
        "admin": 1 if (user and user.get("is_admin")) else 0,
    }

    def tier_met(tier):
        if tier.get("manual") and not stats["admin"]:
            return False
        return all(stats.get(r["key"], 0) >= r["target"] for r in tier["requires"])

    achieved = [t for t in ACCOUNT_TIERS if tier_met(t)]
    current = achieved[-1] if achieved else ACCOUNT_TIERS[0]
    current_index = ACCOUNT_TIERS.index(current)
    next_tier = ACCOUNT_TIERS[current_index + 1] if current_index + 1 < len(ACCOUNT_TIERS) else None

    next_tasks = []
    if next_tier:
        for r in next_tier["requires"]:
            progress = stats.get(r["key"], 0)
            next_tasks.append({
                "label": r["label"],
                "progress": min(progress, r["target"]),
                "target": r["target"],
                "done": progress >= r["target"],
            })

    return {
        "current": current,
        "next": next_tier,
        "next_tasks": next_tasks,
        "next_is_manual": bool(next_tier and next_tier.get("manual")),
        "stats": stats,
        "all_tiers": ACCOUNT_TIERS,
    }


def is_trusted(uid):
    """Trusted users (and admins) can post meetings without review."""
    user = USERS_DB.get(uid)
    return bool(user and (user.get("is_trusted") or user.get("is_admin")))


def set_trusted(uid, trusted, admin_uid):
    """Mark a user trusted/untrusted. Only an admin may do this."""
    if not is_admin(admin_uid):
        return False
    user = USERS_DB.get(uid)
    if not user:
        return False
    user["is_trusted"] = bool(trusted)
    save_data()
    return True


def is_banned(uid):
    user = USERS_DB.get(uid)
    return bool(user and user.get("is_banned"))


def set_banned(uid, banned, admin_uid):
    """Ban/unban a user. Only an admin may do this; admins can't be banned."""
    if not is_admin(admin_uid):
        return False
    user = USERS_DB.get(uid)
    if not user or user.get("is_admin"):
        return False
    user["is_banned"] = bool(banned)
    save_data()
    return True


def delete_user(uid, admin_uid):
    """Delete a user account and their created meetings. Only an admin may
    do this; admins can't delete themselves or other admins."""
    if not is_admin(admin_uid):
        return False
    user = USERS_DB.get(uid)
    if not user or user.get("is_admin"):
        return False
    for mid in list(user.get("created_meeting_ids", [])):
        delete_meeting(mid, admin_uid)
    for m in MEETINGS_DB.values():
        if uid in m.get("joined_uids", []):
            m["joined_uids"].remove(uid)
    del USERS_DB[uid]
    save_data()
    return True


def generate_user_id(email):
    """Create a short deterministic display ID from an email, e.g. 'ART4821'."""
    email = email.strip().lower()
    num = int(hashlib.sha256(email.encode()).hexdigest(), 16) % 10000
    prefix = email.split("@")[0][:3].upper()
    return f"{prefix}{num:04d}"


def get_joined_users_preview(joined_uids, limit=4):
    """Return display info for the first `limit` joined users (avatar/initial/color)."""
    preview = []
    for uid in joined_uids[:limit]:
        user = USERS_DB.get(uid)
        username = user["username"] if user else uid
        preview.append({
            "uid": uid,
            "profile_picture": user.get("profile_picture") if user else None,
            "color": generate_user_color(uid),
            "initial": username[:1].upper(),
        })
    return preview


def generate_user_color(uid):
    """Create a deterministic, vibrant HSL color string from a user's uid."""
    hue = int(hashlib.sha256(uid.encode()).hexdigest(), 16) % 360
    return f"hsl({hue}, 65%, 55%)"


def register_user(email):
    """Add user to USERS_DB if not already present. Returns their display ID."""
    uid = generate_user_id(email)
    if uid not in USERS_DB:
        now = datetime.now(timezone.utc).isoformat()
        USERS_DB[uid] = {
            "uid": uid,
            "email": email,
            "username": email.split("@")[0],
            "joined_meeting_ids": [],
            "swiped_ids": [],
            "created_meeting_ids": [],
            "profile_picture": None,
            "is_admin": email.lower() in ADMIN_EMAILS,
            "is_trusted": False,
            "joined_at": now,
            "last_online": now,
        }
        save_data()
    return uid


def get_user(uid):
    """Return a user dict or None."""
    return USERS_DB.get(uid)


def touch_last_online(uid):
    """Update a user's last-seen timestamp."""
    user = USERS_DB.get(uid)
    if user:
        user["last_online"] = datetime.now(timezone.utc).isoformat()
        save_data()


def user_pass(uid, meeting_id):
    """Swiping left: mark the meeting as seen without joining it."""
    u = USERS_DB.get(uid)
    if not u:
        return
    if meeting_id not in u["swiped_ids"]:
        u["swiped_ids"].append(meeting_id)
    save_data()


def shorten_address(location):
    """Reduce a full geocoded address down to '<city>, <street>', dropping
    districts, postal codes, and the country."""
    if not location:
        return ""
    parts = [p.strip() for p in location.split(",") if p.strip()]
    if len(parts) <= 1:
        return location
    parts = parts[:-1]  # drop trailing country
    parts = [p for p in parts if not p.isdigit() and "district" not in p.lower()]
    if not parts:
        return location
    if len(parts) == 1:
        return parts[0]
    return f"{parts[-1]}, {parts[0]}"


def search_users(query):
    """Return up to 10 users matching the query against UID, email, or username."""
    q = query.lower().strip()
    matches = [
        u for u in USERS_DB.values()
        if q in u["uid"].lower() or q in u["email"].lower() or q in u["username"].lower()
    ][:10]
    return [dict(u, color=generate_user_color(u["uid"])) for u in matches]


# ─── Algorithm 1: Haversine Distance Sort ───────────────────────────────────
EARTH_RADIUS_KM = 6371.0


def haversine_distance(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def sort_meetings_by_distance(meetings, user_lat, user_lng):
    def distance_key(meeting):
        if meeting.lat is None or meeting.lng is None:
            return float("inf")
        return haversine_distance(user_lat, user_lng, meeting.lat, meeting.lng)
    return sorted(meetings, key=distance_key)


# Keep for backward compat in case anything still imports it
def get_default_meetings():
    return get_all_meetings()


def add_meeting_to_session(session, meeting):
    """Deprecated — use add_meeting() instead. Kept so old imports don't break."""
    pass


load_data()
