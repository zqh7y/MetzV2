import math
import hashlib
import json
import os
import psycopg
from datetime import datetime, timedelta, timezone
from cryptography.fernet import Fernet
from utils.models import InPersonMeeting, OnlineMeeting

_fernet = Fernet(os.environ["DATA_ENCRYPTION_KEY"].encode())

# ── Global meetings store (all meetings, keyed by id) ──────────────────────────
# Starts empty — meetings only exist once a real user creates them.
MEETINGS_DB = {}
_next_meeting_id = 1

# ── In-memory user registry (persists while server is running) ────────────────
USERS_DB = {}

# ── Reports of meetings or people, keyed by id ────────────────────────────────
# Blocking lives on the user record instead (a "blocked_uids" list), because it
# is a preference belonging to one person rather than a shared moderation item.
REPORTS_DB = {}
_next_report_id = 1

# Private, account-scoped messages. Activity is for actions; the inbox is a
# durable record of decisions and other messages from Metz.
INBOX_DB = {}
_next_inbox_id = 1

# Accounts with permission to delete any meeting, not just their own.
#
# Read from the environment because this repository is public: a hardcoded list
# tells anyone reading it exactly which accounts are worth attacking, and the
# test addresses below are ones a stranger could plausibly register on a fresh
# deployment and inherit admin from.
#
# ADMIN_EMAILS=you@example.com,someone@else.com
#
# The literals remain as the development fallback so a local checkout still
# works with no configuration. Production should always set the variable.
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get(
        "ADMIN_EMAILS",
        "123@gmail.com,1234@gmail.com,test@gmail.com,ytevil68@gmail.com",
    ).split(",")
    if e.strip()
}


# ── Persistence: MySQL database, with each row's JSON content AES-encrypted ────
_LEGACY_JSON_FILE = os.path.join(os.path.dirname(__file__), "app_data.json")
_LEGACY_DB_FILE = os.path.join(os.path.dirname(__file__), "app_data.db")


def _get_connection():
    """Connect to the single Postgres database used by both Render services.

    Render supplies DATABASE_URL as a secret. The application refuses to fall
    back to a laptop-local database in production, preventing a public service
    from appearing healthy while silently storing each worker's data nowhere.
    """
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required (use Render's internal Postgres URL).")
    conn = psycopg.connect(database_url, autocommit=True)
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY,
                data BYTEA NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                uid VARCHAR(64) PRIMARY KEY,
                data BYTEA NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS meta (
                "key" VARCHAR(64) PRIMARY KEY,
                value VARCHAR(255) NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY,
                data BYTEA NOT NULL
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS inbox_messages (
                id INTEGER PRIMARY KEY,
                data BYTEA NOT NULL
            )
        """)
    return conn

def save_data():
    """Persist encrypted app data in Postgres.

    Upserts plus one cleanup statement per table prevent duplicate-key races
    while keeping deleted records from surviving in the database.
    """
    conn = _get_connection()
    with conn.cursor() as cur:
        tables = (
            ("meetings", "id", MEETINGS_DB),
            ("users", "uid", USERS_DB),
            ("reports", "id", REPORTS_DB),
            ("inbox_messages", "id", INBOX_DB),
        )
        for table, key, records in tables:
            if records:
                cur.executemany(
                    f"INSERT INTO {table} ({key}, data) VALUES (%s, %s) "
                    f"ON CONFLICT ({key}) DO UPDATE SET data = EXCLUDED.data",
                    [(record_id, _fernet.encrypt(json.dumps(record).encode("utf-8")))
                     for record_id, record in records.items()],
                )
                cur.execute(
                    f"DELETE FROM {table} WHERE {key} <> ALL(%s)",
                    (list(records.keys()),),
                )
            else:
                cur.execute(f"DELETE FROM {table}")

        for key, value in (
            ("next_meeting_id", _next_meeting_id),
            ("next_report_id", _next_report_id),
            ("next_inbox_id", _next_inbox_id),
        ):
            cur.execute(
                'INSERT INTO meta ("key", value) VALUES (%s, %s) '
                'ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value',
                (key, str(value)),
            )
    conn.close()

def _migrate_legacy_data():
    """One-time migration from old local files into Postgres."""
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
    """Load meetings, users, and counters from the Postgres database.
    If the database is empty but an old app_data.json/app_data.db file exists,
    migrate it once."""
    global _next_meeting_id, _next_report_id, _next_inbox_id

    conn = _get_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT id, data FROM meetings")
        rows = cur.fetchall()
        for mid, data in rows:
            MEETINGS_DB[mid] = json.loads(_fernet.decrypt(data).decode("utf-8"))
        cur.execute("SELECT uid, data FROM users")
        for uid, data in cur.fetchall():
            USERS_DB[uid] = json.loads(_fernet.decrypt(data).decode("utf-8"))
        cur.execute("SELECT id, data FROM reports")
        for rid, data in cur.fetchall():
            REPORTS_DB[rid] = json.loads(_fernet.decrypt(data).decode("utf-8"))
        cur.execute("SELECT id, data FROM inbox_messages")
        for mid, data in cur.fetchall():
            INBOX_DB[mid] = json.loads(_fernet.decrypt(data).decode("utf-8"))
        cur.execute('SELECT value FROM meta WHERE "key" = \'next_meeting_id\'')
        row = cur.fetchone()
        if row:
            _next_meeting_id = int(row[0])
        cur.execute('SELECT value FROM meta WHERE "key" = \'next_report_id\'')
        row = cur.fetchone()
        if row:
            _next_report_id = int(row[0])
        cur.execute('SELECT value FROM meta WHERE "key" = \'next_inbox_id\'')
        row = cur.fetchone()
        if row:
            _next_inbox_id = int(row[0])
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
    # Deadlines take effect here rather than via a scheduler, so a meeting is
    # always in the right state by the time anyone looks at it.
    refresh_all_commit_statuses()
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
    record = meeting_obj.to_dict()
    # Stamped here rather than on the model so it survives to_dict/from_dict
    # untouched; used by the dashboard's "new this week" figure.
    record["created_at"] = datetime.now(timezone.utc).isoformat()
    MEETINGS_DB[meeting_obj.id] = record
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


# ─── Discussion on a meeting ────────────────────────────────────────────────
# Comments are stored on the meeting record itself (see Meeting.comments), so
# these work on the raw dict in MEETINGS_DB the same way delete_meeting does.

def get_comments(meeting_id):
    """Every comment on a meeting, oldest first. Missing meeting -> []."""
    m = MEETINGS_DB.get(meeting_id)
    if not m:
        return []
    return list(m.get("comments", []))


def add_comment(meeting_id, uid, text):
    """Append a comment to a meeting's discussion.

    Returns the stored comment, or None when the meeting is unknown, the
    author is not a real user, or the text fails validation. Callers get a
    single falsy answer rather than three, because every rejection reaching
    the client is the same 400.
    """
    from utils.models import sanitize_html, validate_comment

    m = MEETINGS_DB.get(meeting_id)
    if not m or not uid or uid not in USERS_DB:
        return None

    clean = sanitize_html(text)
    if validate_comment(clean):
        return None

    comments = m.setdefault("comments", [])
    # Ids are per-meeting rather than global: a comment is only ever addressed
    # as "this one, on this meeting", so a shared counter and the meta row it
    # would need buy nothing here.
    comment = {
        "id": max((c.get("id", 0) for c in comments), default=0) + 1,
        "uid": uid,
        # Denormalised the way creator_username is, so a comment still renders
        # if the account later goes away. Live callers prefer display_name_for.
        "username": USERS_DB[uid].get("username", ""),
        "text": clean,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    comments.append(comment)
    save_data()
    return comment


def can_delete_comment(uid, meeting, comment):
    """Its author, the meeting's host, or an admin.

    The host is included because they are the one accountable for the meeting
    they are running, and moderation should not require waiting for an admin.
    """
    if not uid:
        return False
    if is_admin(uid) or comment.get("uid") == uid:
        return True
    return meeting.get("creator_uid") == uid


def delete_comment(meeting_id, comment_id, uid):
    """Remove one comment. Returns True only if it existed and uid may delete it."""
    m = MEETINGS_DB.get(meeting_id)
    if not m:
        return False
    comments = m.get("comments", [])
    for index, comment in enumerate(comments):
        if comment.get("id") == comment_id:
            if not can_delete_comment(uid, m, comment):
                return False
            comments.pop(index)
            save_data()
            return True
    return False


def _parse_deadline(value):
    """Deadlines are stored as 'YYYY-MM-DD HH:MM' local time."""
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M")
    except (ValueError, TypeError):
        return None


def _refresh_commit_status(m):
    """Move a meeting through its commitment lifecycle.

    gathering -> confirmed  as soon as the minimum is reached
    gathering -> awaiting   when the deadline passes still short of it
                            (the organiser then decides — see decide_threshold)
    """
    minimum = int(m.get("min_attendees") or 0)
    if not minimum:
        m["commit_status"] = m.get("commit_status") or "open"
        return m["commit_status"]

    state = m.get("commit_status") or "gathering"
    if state in ("cancelled", "confirmed"):
        return state

    joined = len(m.get("joined_uids", []))
    if joined >= minimum:
        m["commit_status"] = "confirmed"
    else:
        deadline = _parse_deadline(m.get("join_deadline"))
        m["commit_status"] = "awaiting" if deadline and datetime.now() > deadline else "gathering"
    return m["commit_status"]


def refresh_all_commit_statuses():
    """Called when meetings are read, so deadlines take effect without a
    background scheduler. Cheap: a handful of comparisons per meeting."""
    changed = False
    for m in MEETINGS_DB.values():
        before = m.get("commit_status")
        if _refresh_commit_status(m) != before:
            changed = True
    if changed:
        save_data()


# ─── Showing up: timing, the join window, and the cost of bailing ───────────
# Joining is a promise, so the app needs to know where a meeting sits in its
# own timeline. Meetings have no explicit end time, so one is assumed.
JOIN_WINDOW_MINUTES = 10     # how early an online call's button goes live
ASSUMED_DURATION_HOURS = 2   # how long a meeting is treated as running for
LATE_BAIL_HOURS = 6          # leaving inside this counts against you
CHECKIN_GRACE_HOURS = 1      # wait this long after the end before asking "did you go?"


def _meeting_start(m):
    """Meeting times are stored as 'YYYY-MM-DD HH:MM' local time, same as deadlines."""
    return _parse_deadline(m.get("time"))


def meeting_phase(m):
    """Where a meeting is right now: upcoming / soon / live / ended.

    Meetings with an unparseable time are treated as "upcoming" — better to
    keep showing a broken-looking meeting than to silently retire it.
    """
    start = _meeting_start(m)
    if not start:
        return "upcoming"
    now = datetime.now()
    end = start + timedelta(hours=ASSUMED_DURATION_HOURS)
    if now >= end:
        return "ended"
    if now >= start:
        return "live"
    if (start - now).total_seconds() <= JOIN_WINDOW_MINUTES * 60:
        return "soon"
    return "upcoming"


def seconds_until_start(m):
    """Negative once the meeting has started. None if it has no usable time."""
    start = _meeting_start(m)
    if not start:
        return None
    return int((start - datetime.now()).total_seconds())


def link_view(m, uid):
    """What this user is allowed to see of an online meeting's join link.

    The link is the whole point of an online meeting, so it is not public:
    only people who committed (plus the organiser and admins) get the URL,
    and the button to actually open it goes live JOIN_WINDOW_MINUTES before
    the start — the same "be there at the time" rule the in-person ones have.
    """
    link = m.get("link") or ""
    if not link:
        return None

    is_host = m.get("creator_uid") == uid or is_admin(uid)
    visible = bool(uid) and (uid in m.get("joined_uids", []) or is_host)
    phase = meeting_phase(m)

    return {
        "visible": visible,
        "url": link if visible else "",
        "live": visible and phase in ("soon", "live"),
        "phase": phase,
        "opens_in": max(0, (seconds_until_start(m) or 0) - JOIN_WINDOW_MINUTES * 60),
        "window_minutes": JOIN_WINDOW_MINUTES,
    }


def client_meeting_dict(meeting_obj, viewer_uid):
    """A meeting as JSON for the browser, with the join link redacted for
    anyone who hasn't joined. to_dict() stays the full record — that one is
    what gets persisted."""
    d = meeting_obj.to_dict()
    if d.get("is_online"):
        view = link_view(MEETINGS_DB.get(meeting_obj.id, d), viewer_uid)
        d["link"] = view["url"] if view else ""
        d["link_view"] = view
    d["phase"] = meeting_phase(d)
    d["seconds_until_start"] = seconds_until_start(d)
    return d


def commitment_brief(meeting_id, uid):
    """Everything the join-commitment sheet needs to show before someone
    promises to turn up. Returned by the join endpoint instead of joining."""
    m = MEETINGS_DB.get(meeting_id)
    if not m:
        return None

    joined_uids = m.get("joined_uids", [])
    cap = int(m.get("max_attendees") or 0)
    creator = USERS_DB.get(m.get("creator_uid") or "")
    return {
        "id": meeting_id,
        "title": m.get("title", ""),
        "description": m.get("description", ""),
        "time": m.get("time", ""),
        "is_online": bool(m.get("link")),
        "location": m.get("location", ""),
        "short_location": shorten_address(m.get("location", "")),
        "organiser": (creator or {}).get("display_name") or (creator or {}).get("username") or m.get("creator_username", ""),
        "joined_count": len(joined_uids),
        "min_attendees": int(m.get("min_attendees") or 0),
        "spots_left": (max(0, cap - len(joined_uids)) if cap else None),
        "will_waitlist": bool(cap and len(joined_uids) >= cap),
        "join_deadline": m.get("join_deadline", ""),
        "commit_status": m.get("commit_status", "open"),
        "late_bail_hours": LATE_BAIL_HOURS,
        "window_minutes": JOIN_WINDOW_MINUTES,
        "phase": meeting_phase(m),
        "reliability": get_reliability(uid),
    }


def toggle_join_meeting(uid, meeting_id, pledge=False, confirm_bail=False):
    """Toggle a user's join on a meeting.

    Joining is deliberately not a single tap: unless the caller passes
    `pledge=True` (the commitment sheet was shown and accepted) this returns
    {"needs_commitment": ...} instead of joining. Leaving close to the start
    likewise needs `confirm_bail=True`, and is then recorded as a late bail.

    Respects the optional cap: once a meeting is full, further joiners go on
    the waitlist, and leaving promotes the person who has waited longest.
    Returns {"joined", "count", ...} or None.
    """
    m = MEETINGS_DB.get(meeting_id)
    user = USERS_DB.get(uid)
    if not m or not uid:
        return None

    joined_uids = m.setdefault("joined_uids", [])
    waitlist_uids = m.setdefault("waitlist_uids", [])

    # Joining (as opposed to leaving) is what needs the promise.
    if uid not in joined_uids and uid not in waitlist_uids and not pledge:
        return {"needs_commitment": True, "meeting": commitment_brief(meeting_id, uid)}

    # Backing out once other people are counting on you.
    if uid in joined_uids and not confirm_bail:
        remaining = seconds_until_start(m)
        if remaining is not None and remaining <= LATE_BAIL_HOURS * 3600:
            return {
                "needs_bail_confirm": True,
                "meeting": commitment_brief(meeting_id, uid),
                "hours_left": max(0, round(remaining / 3600, 1)),
                "started": remaining <= 0,
            }

    waitlist = waitlist_uids
    cap = int(m.get("max_attendees") or 0)
    promoted_uid = None
    waitlisted = False
    bailed_late = False

    if uid in joined_uids:
        joined_uids.remove(uid)
        joined = False
        # Pulling out this close to the start is what a no-show costs the
        # people who planned around you, so it is recorded the same way.
        remaining = seconds_until_start(m)
        if remaining is not None and remaining <= LATE_BAIL_HOURS * 3600:
            m.setdefault("late_bails", {})[uid] = datetime.now(timezone.utc).isoformat()
            bailed_late = True
        if user and meeting_id in user["joined_meeting_ids"]:
            user["joined_meeting_ids"].remove(meeting_id)
        # A place just opened up — give it to whoever waited longest
        if waitlist and (not cap or len(joined_uids) < cap):
            promoted_uid = waitlist.pop(0)
            joined_uids.append(promoted_uid)
            promoted = USERS_DB.get(promoted_uid)
            if promoted and meeting_id not in promoted["joined_meeting_ids"]:
                promoted["joined_meeting_ids"].append(meeting_id)
    elif uid in waitlist:
        waitlist.remove(uid)          # leaving the waitlist
        joined = False
    elif cap and len(joined_uids) >= cap:
        waitlist.append(uid)          # full: queue instead of rejecting
        joined = False
        waitlisted = True
        if user and meeting_id not in user["swiped_ids"]:
            user["swiped_ids"].append(meeting_id)
    else:
        joined_uids.append(uid)
        joined = True
        # Re-joining after a late bail clears the black mark: they came back.
        m.get("late_bails", {}).pop(uid, None)
        if user and meeting_id not in user["joined_meeting_ids"]:
            user["joined_meeting_ids"].append(meeting_id)
        if user and meeting_id not in user["swiped_ids"]:
            user["swiped_ids"].append(meeting_id)

    _refresh_commit_status(m)
    save_data()
    return {
        "joined": joined,
        "count": len(joined_uids),
        "waitlisted": waitlisted,
        "waitlist_count": len(waitlist),
        "promoted_uid": promoted_uid,
        "bailed_late": bailed_late,
        "commit_status": m.get("commit_status"),
        "min_attendees": int(m.get("min_attendees") or 0),
        "spots_left": (max(0, cap - len(joined_uids)) if cap else None),
        "link_view": link_view(m, uid),
    }


def decide_threshold(meeting_id, uid, action, new_deadline=""):
    """The organiser's call once a deadline passes under the minimum.

    action: "run" (do it anyway), "extend" (new deadline), "cancel".
    Only the meeting's creator or an admin may decide.
    """
    m = MEETINGS_DB.get(meeting_id)
    if not m:
        return None
    if m.get("creator_uid") != uid and not is_admin(uid):
        return None

    if action == "run":
        m["commit_status"] = "confirmed"
    elif action == "cancel":
        m["commit_status"] = "cancelled"
    elif action == "extend":
        if not _parse_deadline(new_deadline):
            return None
        m["join_deadline"] = new_deadline
        m["commit_status"] = "gathering"
        _refresh_commit_status(m)
    else:
        return None

    save_data()
    return {"commit_status": m["commit_status"], "join_deadline": m.get("join_deadline", "")}


def meetings_awaiting_decision(uid):
    """Threshold meetings this user organises that have passed their deadline
    without filling — surfaced on their profile so the decision isn't missed."""
    refresh_all_commit_statuses()
    from utils.models import meeting_from_dict
    return [
        meeting_from_dict(m) for m in MEETINGS_DB.values()
        if m.get("creator_uid") == uid and m.get("commit_status") == "awaiting"
    ]


# ─── Did you actually go? ───────────────────────────────────────────────────
# A join only means something if turning up (or not) is recorded somewhere.
# After a meeting ends, the people who joined confirm whether they went, and
# the organiser can correct them. Everything else — the reliability score,
# the profile badge — is derived from those records rather than stored.
ATTENDANCE_STATES = ("went", "missed")


def checkin_is_open(m):
    """Attendance can only be settled once the meeting is actually over."""
    start = _meeting_start(m)
    if not start:
        return False
    return datetime.now() >= start + timedelta(hours=ASSUMED_DURATION_HOURS)


def record_checkin(uid, meeting_id, status):
    """The attendee's own answer to "did you go?".

    Deliberately allows admitting a miss — the score is meant to be honest,
    not flattering, and the organiser can overrule either way.
    """
    m = MEETINGS_DB.get(meeting_id)
    if not m or status not in ATTENDANCE_STATES:
        return None
    if uid not in m.get("joined_uids", []):
        return None
    if not checkin_is_open(m):
        return None

    m.setdefault("attendance", {})[uid] = status
    save_data()
    return {"status": status, "reliability": get_reliability(uid)}


def set_attendance(meeting_id, marker_uid, target_uid, status):
    """The organiser's verdict on one attendee. Only the meeting's creator
    (or an admin) may mark, and only after the meeting has ended."""
    m = MEETINGS_DB.get(meeting_id)
    if not m:
        return None
    if m.get("creator_uid") != marker_uid and not is_admin(marker_uid):
        return None
    if target_uid not in m.get("joined_uids", []) or not checkin_is_open(m):
        return None

    attendance = m.setdefault("attendance", {})
    if status == "clear":
        attendance.pop(target_uid, None)
    elif status in ATTENDANCE_STATES:
        attendance[target_uid] = status
    else:
        return None

    save_data()
    return {"uid": target_uid, "status": attendance.get(target_uid, ""),
            "reliability": get_reliability(target_uid)}


def get_reliability(uid):
    """How often this user actually turns up to what they join.

    Counts settled records only: a meeting nobody has confirmed yet sits in
    "pending" and moves the score neither way. Someone with nothing settled
    has no score rather than a suspicious 0%.
    """
    went = missed = pending = 0
    if uid:
        for m in MEETINGS_DB.values():
            marked = (m.get("attendance") or {}).get(uid)
            if marked == "went":
                went += 1
            elif marked == "missed":
                missed += 1
            elif uid in (m.get("late_bails") or {}):
                missed += 1          # bailed too late to be replaced
            elif uid in m.get("joined_uids", []) and checkin_is_open(m):
                pending += 1         # over, but nobody has said yet

    settled = went + missed
    score = round(went / settled * 100) if settled else None

    if score is None:
        label = "No record yet"
    elif score >= 90:
        label = "Always shows up"
    elif score >= 70:
        label = "Usually shows up"
    elif score >= 40:
        label = "Hit and miss"
    else:
        label = "Rarely shows up"

    return {"score": score, "went": went, "missed": missed,
            "pending": pending, "settled": settled, "label": label}


def meetings_needing_checkin(uid):
    """Ended meetings this user joined but hasn't answered for yet."""
    from utils.models import meeting_from_dict
    out = []
    for m in MEETINGS_DB.values():
        if uid in m.get("joined_uids", []) and checkin_is_open(m) \
                and uid not in (m.get("attendance") or {}):
            out.append(meeting_from_dict(m))
    out.sort(key=lambda m: m.time, reverse=True)
    return out


def meetings_needing_attendance(uid):
    """Ended meetings this user organised where somebody is still unmarked."""
    from utils.models import meeting_from_dict
    out = []
    for m in MEETINGS_DB.values():
        if m.get("creator_uid") != uid or not checkin_is_open(m):
            continue
        attendance = m.get("attendance") or {}
        if any(a not in attendance for a in m.get("joined_uids", [])):
            out.append(meeting_from_dict(m))
    out.sort(key=lambda m: m.time, reverse=True)
    return out


def attendee_rows(meeting_id):
    """The joined users of a meeting, with their attendance mark — what the
    organiser's marking panel and the detail page's people list render."""
    m = MEETINGS_DB.get(meeting_id)
    if not m:
        return []
    attendance = m.get("attendance") or {}
    rows = []
    for uid in m.get("joined_uids", []):
        user = USERS_DB.get(uid) or {}
        rows.append({
            "uid": uid,
            "username": user.get("display_name") or user.get("username") or uid,
            "avatar_emoji": user.get("avatar_emoji", ""),
            "profile_picture": user.get("profile_picture"),
            "color": generate_user_color(uid),
            "initial": (user.get("display_name") or user.get("username") or uid)[:1].upper(),
            "is_trusted": is_trusted(uid),
            "attendance": attendance.get(uid, ""),
            "reliability": get_reliability(uid),
        })
    return rows


def next_up_meeting(uid):
    """The soonest meeting this user has joined that hasn't ended — what the
    "Next up" reminder on Home counts down to, so a join doesn't quietly
    disappear into a list nobody scrolls back to."""
    user = USERS_DB.get(uid)
    if not user:
        return None
    from utils.models import meeting_from_dict

    candidates = []
    for mid in user.get("joined_meeting_ids", []):
        m = MEETINGS_DB.get(mid)
        if not m or m.get("status") == "pending" or m.get("commit_status") == "cancelled":
            continue
        start = _meeting_start(m)
        if start and meeting_phase(m) != "ended":
            candidates.append((start, m))

    if not candidates:
        return None
    candidates.sort(key=lambda pair: pair[0])
    return meeting_from_dict(candidates[0][1])


def is_admin(uid):
    """Whether this account has admin rights.

    ADMIN_EMAILS is the authority, checked live on every call.

    The stored "is_admin" flag is written once, at registration, from the same
    list. Reading only that flag made the list effectively permanent: an
    account created before the variable was set could never become an admin,
    and taking an address out of the list never removed anyone's access. Both
    now take effect on the next deploy, which is what an operator expects from
    a configuration value.

    The stored flag is kept for the dashboard's counts and for anything that
    inspects a user record directly.
    """
    user = USERS_DB.get(uid)
    if not user:
        return False
    return (user.get("email") or "").lower() in ADMIN_EMAILS


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


def _purge_user(uid, acting_uid):
    """Remove a user and every trace of them from the meetings.

    Shared by the admin path and by someone deleting their own account, so the
    two cannot disagree about what "deleted" means.

    Deliberately thorough. Removing the account while leaving the uid in an
    attendance map or a waitlist would keep a deleted person counted in other
    people's meetings and in their show-up rates — the record would outlive the
    account it belonged to, which is exactly what deletion is supposed to
    prevent.
    """
    user = USERS_DB.get(uid)
    if not user:
        return False

    # Their own meetings go with them.
    for mid in list(user.get("created_meeting_ids", [])):
        delete_meeting(mid, acting_uid)

    # Then every reference in meetings they merely took part in.
    for m in MEETINGS_DB.values():
        if uid in m.get("joined_uids", []):
            m["joined_uids"].remove(uid)
        if uid in (m.get("waitlist_uids") or []):
            m["waitlist_uids"].remove(uid)
        (m.get("attendance") or {}).pop(uid, None)
        (m.get("late_bails") or {}).pop(uid, None)

    del USERS_DB[uid]
    # A deleted account must not leave private messages behind. Also remove it
    # from other users' block lists so a recycled identity can never inherit a
    # prior block relationship.
    for message_id, message in list(INBOX_DB.items()):
        if message.get("uid") == uid:
            del INBOX_DB[message_id]
    for other in USERS_DB.values():
        blocked = other.get("blocked_uids") or []
        if uid in blocked:
            blocked.remove(uid)
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
    return _purge_user(uid, admin_uid)


def delete_own_account(uid):
    """Let someone delete their own account.

    Separate from delete_user() because that one is an admin action and refuses
    to touch admins — which would have left an admin unable to leave. App
    stores require this to be doable from inside the app, without asking
    anyone's permission, so there is no privilege check here beyond the account
    existing.
    """
    if not USERS_DB.get(uid):
        return False
    return _purge_user(uid, uid)


# ── Reporting and blocking ────────────────────────────────────────────────
# App stores require both of these from anything carrying user-generated
# content: a way to flag something for a human, and a way to stop seeing a
# particular person without waiting for that human.

# ?? Inbox ??????????????????????????????????????????????????????????????????
def add_inbox_message(uid, title, body, kind="system"):
    """Send a durable, private system message to one existing account."""
    global _next_inbox_id
    if not uid or uid not in USERS_DB:
        return None
    message = {
        "id": _next_inbox_id,
        "uid": uid,
        "title": str(title or "Update from Metz")[:120],
        "body": str(body or "")[:1000],
        "kind": kind if kind in ("system", "moderation") else "system",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "read_at": None,
    }
    INBOX_DB[_next_inbox_id] = message
    _next_inbox_id += 1
    save_data()
    return message


def get_inbox_messages(uid):
    """Newest first. Never return messages belonging to another account."""
    return sorted(
        [m.copy() for m in INBOX_DB.values() if m.get("uid") == uid],
        key=lambda m: m.get("created_at") or "", reverse=True,
    )


def unread_inbox_count(uid):
    return sum(1 for m in INBOX_DB.values() if m.get("uid") == uid and not m.get("read_at"))


def mark_inbox_read(uid, message_id):
    message = INBOX_DB.get(int(message_id))
    if not message or message.get("uid") != uid:
        return False
    if not message.get("read_at"):
        message["read_at"] = datetime.now(timezone.utc).isoformat()
        save_data()
    return True


def mark_all_inbox_read(uid):
    changed = False
    now = datetime.now(timezone.utc).isoformat()
    for message in INBOX_DB.values():
        if message.get("uid") == uid and not message.get("read_at"):
            message["read_at"] = now
            changed = True
    if changed:
        save_data()
    return changed


REPORT_REASONS = {
    "spam": "Spam or a scam",
    "harassment": "Harassment or bullying",
    "hate": "Hate speech",
    "sexual": "Sexual or adult content",
    "violence": "Violence or threats",
    "illegal": "Something illegal",
    "fake": "Impersonation or a fake meeting",
    "other": "Something else",
}

MAX_REPORT_DETAIL = 500


def add_report(reporter_uid, target_type, target_id, reason, detail=""):
    """File a report about a meeting ("meeting") or a person ("user").

    Returns the stored report, or None if the input was not usable. Reports are
    kept even after the thing they point at is deleted — the record of *why*
    something was removed is the part a moderator needs later.
    """
    global _next_report_id
    from utils.models import sanitize_html

    if target_type not in ("meeting", "user"):
        return None
    if reason not in REPORT_REASONS:
        return None
    if not USERS_DB.get(reporter_uid):
        return None

    # One open report per person per thing. Filing again should not let one
    # user flood the queue, and it should not look like many complaints.
    for existing in REPORTS_DB.values():
        if (existing.get("reporter_uid") == reporter_uid
                and existing.get("target_type") == target_type
                and str(existing.get("target_id")) == str(target_id)
                and existing.get("status") == "open"):
            return existing

    # A snapshot of what was reported, because the meeting may be deleted
    # before anyone looks at the queue.
    snapshot = ""
    if target_type == "meeting":
        m = MEETINGS_DB.get(int(target_id)) if str(target_id).isdigit() else None
        if m:
            snapshot = f"{m.get('title', '')} — {m.get('description', '')}"[:200]
    else:
        u = USERS_DB.get(target_id)
        if u:
            snapshot = f"{u.get('username', '')} — {u.get('bio', '')}"[:200]

    report = {
        "id": _next_report_id,
        "reporter_uid": reporter_uid,
        "target_type": target_type,
        "target_id": str(target_id),
        "reason": reason,
        "detail": sanitize_html((detail or "").strip())[:MAX_REPORT_DETAIL],
        "snapshot": snapshot,
        "status": "open",          # open | actioned | dismissed
        "created_at": datetime.now(timezone.utc).isoformat(),
        "resolved_by": None,
        "resolved_at": None,
    }
    REPORTS_DB[_next_report_id] = report
    _next_report_id += 1
    save_data()
    return report


def get_reports(status=None):
    """Reports, newest first, optionally filtered by status."""
    rows = [r for r in REPORTS_DB.values() if status is None or r.get("status") == status]
    return sorted(rows, key=lambda r: r.get("created_at") or "", reverse=True)


def open_report_count():
    """How many reports are waiting on a moderator — drives the admin badge."""
    return sum(1 for r in REPORTS_DB.values() if r.get("status") == "open")


def resolve_report(report_id, admin_uid, action):
    """Close a report. `action` is "actioned" (something was done) or "dismissed"."""
    if not is_admin(admin_uid):
        return False
    report = REPORTS_DB.get(int(report_id))
    # An already closed report must not create a duplicate notification if an
    # admin taps a decision twice or retries after a slow connection.
    if not report or report.get("status") != "open" or action not in ("actioned", "dismissed"):
        return False
    report["status"] = action
    report["resolved_by"] = admin_uid
    report["resolved_at"] = datetime.now(timezone.utc).isoformat()
    if action == "actioned":
        add_inbox_message(
            report["reporter_uid"],
            "Your report was actioned",
            "Thanks for helping keep Metz safe. We reviewed your report and took appropriate action. For privacy and safety, we cannot share further details.",
            "moderation",
        )
    else:
        add_inbox_message(
            report["reporter_uid"],
            "We reviewed your report",
            "Thanks for taking the time to report this. We reviewed it and did not take action at this time. You can still block an account to stop seeing it.",
            "moderation",
        )
    save_data()
    return True


def block_user(uid, target_uid):
    """Stop `uid` seeing `target_uid`.

    One-directional and immediate: it is the thing someone can do for
    themselves without waiting for a report to be reviewed. Blocking yourself
    is refused, since it would hide your own meetings from you.
    """
    user = USERS_DB.get(uid)
    if not user or uid == target_uid or not USERS_DB.get(target_uid):
        return False
    blocked = user.setdefault("blocked_uids", [])
    if target_uid not in blocked:
        blocked.append(target_uid)
        save_data()
    return True


def unblock_user(uid, target_uid):
    user = USERS_DB.get(uid)
    if not user:
        return False
    blocked = user.setdefault("blocked_uids", [])
    if target_uid in blocked:
        blocked.remove(target_uid)
        save_data()
    return True


def get_blocked_uids(uid):
    user = USERS_DB.get(uid)
    return list(user.get("blocked_uids", [])) if user else []


def has_blocked(uid, target_uid):
    return target_uid in get_blocked_uids(uid)


def filter_blocked(uid, meetings):
    """Drop meetings created by anyone this user has blocked.

    Applied at the listing level rather than at creation, so unblocking brings
    the meetings straight back rather than leaving a hole in someone's history.
    """
    blocked = set(get_blocked_uids(uid))
    if not blocked:
        return meetings

    def creator_of(m):
        # Callers pass Meeting objects (the listings) or raw dicts (the stored
        # rows), so accept both rather than making each site convert.
        return m.get("creator_uid") if isinstance(m, dict) else getattr(m, "creator_uid", None)

    return [m for m in meetings if creator_of(m) not in blocked]


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


# Users are searchable by email, but the email itself is never returned —
# search used to hand every user's address to any logged-in caller.
def public_user(u):
    """The subset of a user record that is safe to show to other people."""
    created = len(u.get("created_meeting_ids", []))
    joined = len(u.get("joined_meeting_ids", []))
    return {
        "uid": u["uid"],
        "username": u.get("display_name") or u.get("username", ""),
        "bio": u.get("bio", ""),
        "avatar_emoji": u.get("avatar_emoji", ""),
        "profile_picture": u.get("profile_picture"),
        "color": generate_user_color(u["uid"]),
        "is_trusted": bool(u.get("is_trusted")),
        "is_admin": bool(u.get("is_admin")),
        "meetings_created": created,
        "meetings_joined": joined,
        "last_online": u.get("last_online"),
        "is_online": _is_recently_online(u),
    }


def _is_recently_online(u, minutes=5):
    stamp = u.get("last_online")
    if not stamp:
        return False
    try:
        seen = datetime.fromisoformat(stamp)
    except ValueError:
        return False
    if seen.tzinfo is None:
        seen = seen.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - seen).total_seconds() < minutes * 60


def search_users(query):
    """Return up to 10 users matching the query against UID, email, or username."""
    q = query.lower().strip()
    matches = [
        u for u in USERS_DB.values()
        if q in u["uid"].lower() or q in u["email"].lower()
        or q in u.get("username", "").lower() or q in (u.get("display_name") or "").lower()
    ][:10]
    return [public_user(u) for u in matches]


def activity_score(u):
    """How active a user is: organising counts for more than attending, and
    both decay so a long-dormant account doesn't outrank a current one."""
    created = len(u.get("created_meeting_ids", []))
    joined = len(u.get("joined_meeting_ids", []))
    score = created * 5 + joined * 2

    stamp = u.get("last_online")
    if stamp:
        try:
            seen = datetime.fromisoformat(stamp)
            if seen.tzinfo is None:
                seen = seen.replace(tzinfo=timezone.utc)
            days_ago = (datetime.now(timezone.utc) - seen).total_seconds() / 86400
            if days_ago < 1:
                score += 6
            elif days_ago < 7:
                score += 3
            elif days_ago > 60:
                score -= 4
        except ValueError:
            pass

    if u.get("is_trusted"):
        score += 3
    return score


def get_active_users(limit=12, exclude_uid=None):
    """Most active members, for the People tab's default view."""
    candidates = [
        u for u in USERS_DB.values()
        if not u.get("is_banned") and u["uid"] != exclude_uid
    ]
    candidates.sort(key=activity_score, reverse=True)
    return [public_user(u) for u in candidates[:limit]]


def _within_days(iso_str, days):
    """True if an ISO timestamp is within the last `days` days."""
    if not iso_str:
        return False
    try:
        dt = datetime.fromisoformat(iso_str)
    except ValueError:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).total_seconds() <= days * 86400


def platform_stats():
    """A snapshot of the whole platform for the developer dashboard.

    Everything is derived from the in-memory stores, so it is cheap to call
    on each dashboard load and always reflects the current state.
    """
    refresh_all_commit_statuses()
    users = list(USERS_DB.values())
    meetings = list(MEETINGS_DB.values())

    def count(seq, pred):
        return sum(1 for x in seq if pred(x))

    total_joins = sum(len(m.get("joined_uids", [])) for m in meetings)
    threshold = [m for m in meetings if int(m.get("min_attendees") or 0) > 0]

    # Top organisers by number of meetings created, richest first
    organisers = sorted(
        (u for u in users if u.get("created_meeting_ids")),
        key=lambda u: len(u["created_meeting_ids"]), reverse=True,
    )[:5]
    top_organisers = [{
        "uid": u["uid"],
        "name": u.get("display_name") or u.get("username") or u["uid"],
        "created": len(u.get("created_meeting_ids", [])),
        "color": generate_user_color(u["uid"]),
    } for u in organisers]

    return {
        "users": {
            "total": len(users),
            # Derived from ADMIN_EMAILS, same as is_admin(), so the dashboard
            # agrees with who can actually use the admin screens rather than
            # counting a flag frozen at registration.
            "admins": count(users, lambda u: (u.get("email") or "").lower() in ADMIN_EMAILS),
            "trusted": count(
                users,
                lambda u: u.get("is_trusted") and (u.get("email") or "").lower() not in ADMIN_EMAILS,
            ),
            "banned": count(users, lambda u: u.get("is_banned")),
            "online_now": count(users, _is_recently_online),
            "new_7d": count(users, lambda u: _within_days(u.get("joined_at"), 7)),
            "with_avatar": count(users, lambda u: u.get("avatar_emoji") or u.get("profile_picture")),
        },
        "meetings": {
            "total": len(meetings),
            "approved": count(meetings, lambda m: m.get("status") == "approved"),
            "pending": count(meetings, lambda m: m.get("status") == "pending"),
            "online": count(meetings, lambda m: m.get("link")),
            "inperson": count(meetings, lambda m: m.get("location")),
            "new_7d": count(meetings, lambda m: _within_days(m.get("created_at"), 7)),
        },
        "threshold": {
            "total": len(threshold),
            "confirmed": count(threshold, lambda m: m.get("commit_status") == "confirmed"),
            "gathering": count(threshold, lambda m: m.get("commit_status") == "gathering"),
            "awaiting": count(threshold, lambda m: m.get("commit_status") == "awaiting"),
            "cancelled": count(threshold, lambda m: m.get("commit_status") == "cancelled"),
        },
        "engagement": {
            "total_joins": total_joins,
            "avg_per_meeting": round(total_joins / len(meetings), 1) if meetings else 0,
            "pending_review": count(meetings, lambda m: m.get("status") == "pending"),
        },
        "top_organisers": top_organisers,
    }


PROFILE_EMOJIS = ["😀", "😎", "🤓", "🥳", "🧑‍💻", "🎨", "🎧", "⚽", "🏔️",
                  "🌊", "🍕", "☕", "📚", "🎬", "🐱", "🐶", "🌸", "🚀"]

MAX_DISPLAY_NAME = 32
MAX_BIO = 160


def update_profile(uid, display_name=None, bio=None, avatar_emoji=None):
    """Update the parts of a profile a user is allowed to change.

    Everything is length-capped and HTML-escaped, since these strings end up
    in other people's browsers.
    """
    from utils.models import sanitize_html

    user = USERS_DB.get(uid)
    if not user:
        return False

    if display_name is not None:
        cleaned = sanitize_html(display_name.strip())[:MAX_DISPLAY_NAME]
        user["display_name"] = cleaned or None
    if bio is not None:
        user["bio"] = sanitize_html(bio.strip())[:MAX_BIO]
    if avatar_emoji is not None:
        # Whitelist only — an arbitrary string here would be rendered as-is.
        user["avatar_emoji"] = avatar_emoji if avatar_emoji in PROFILE_EMOJIS else ""

    save_data()
    return True


def display_name_for(uid):
    user = USERS_DB.get(uid)
    if not user:
        return uid
    return user.get("display_name") or user.get("username") or uid


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
