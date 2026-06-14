import math
import hashlib
import json
import os
from datetime import datetime, timezone
from functions.models import InPersonMeeting, OnlineMeeting

# ── Global meetings store (all meetings, keyed by id) ──────────────────────────
# Starts empty — meetings only exist once a real user creates them.
MEETINGS_DB = {}
_next_meeting_id = 1

# ── In-memory user registry (persists while server is running) ────────────────
USERS_DB = {}

# Accounts with permission to delete any meeting, not just their own.
ADMIN_EMAILS = {"123@gmail.com", "1234@gmail.com", "test@gmail.com", "ytevil68@gmail.com"}


# ── Persistence: keep meetings/users/joins on disk between runs ────────────────
DATA_FILE = os.path.join(os.path.dirname(__file__), "app_data.json")


def save_data():
    """Write meetings, users, and the meeting id counter to disk."""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "meetings": MEETINGS_DB,
            "users": USERS_DB,
            "next_meeting_id": _next_meeting_id,
        }, f)


def load_data():
    """Load meetings, users, and the meeting id counter from disk, if present."""
    global _next_meeting_id
    if not os.path.exists(DATA_FILE):
        return
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        saved = json.load(f)
    for mid, m in saved.get("meetings", {}).items():
        MEETINGS_DB[int(mid)] = m
    USERS_DB.update(saved.get("users", {}))
    _next_meeting_id = saved.get("next_meeting_id", _next_meeting_id)


def get_all_meetings():
    """Return all meetings as model objects."""
    from functions.models import meeting_from_dict
    return [meeting_from_dict(d) for d in MEETINGS_DB.values()]


def add_meeting(meeting_obj, creator_uid=None):
    """Add a meeting to MEETINGS_DB and record it on the creator's profile."""
    global _next_meeting_id
    meeting_obj.id = _next_meeting_id
    _next_meeting_id += 1
    if creator_uid and creator_uid in USERS_DB:
        meeting_obj.creator_uid = creator_uid
        meeting_obj.creator_username = USERS_DB[creator_uid]["username"]
        USERS_DB[creator_uid]["created_meeting_ids"].append(meeting_obj.id)
    MEETINGS_DB[meeting_obj.id] = meeting_obj.to_dict()
    save_data()
    return meeting_obj


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


def generate_user_id(email):
    """Create a short deterministic display ID from an email, e.g. 'ART4821'."""
    num = int(hashlib.md5(email.encode()).hexdigest(), 16) % 10000
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
    hue = int(hashlib.md5(uid.encode()).hexdigest(), 16) % 360
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
