"""Seed 10 demo meetings across the next four days.

A freshly deployed database is empty, which makes the app impossible to judge:
the map has no pins, the list is blank and every screen shows its empty state.
This fills it with something plausible to look at.

Run it against whichever database you want populated:

    # Render (Postgres) — use the EXTERNAL url, you are outside their network
    DATABASE_URL="postgresql://..." python tools/seed_demo_meetings.py

    # add --users N to create demo accounts if the database has none
    DATABASE_URL="..." python tools/seed_demo_meetings.py --users 8

Everything it writes is tagged so it can be taken out again cleanly:

    DATABASE_URL="..." python tools/seed_demo_meetings.py --undo

Meetings are attributed to accounts that already exist, because a meeting whose
creator is not a real user renders with a blank organiser and no show-up rate.
Only when there are none does it create demo accounts, and those are marked too.
"""

import argparse
import os
import random
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv

load_dotenv()

if not os.environ.get("DATABASE_URL"):
    sys.exit("DATABASE_URL is required. Pass the database you want to seed.")

# data.py runs load_data() at import, and load_data() quietly migrates
# app_data.json into the database whenever that database is empty. Run this from
# a machine that still has the old file, against a fresh deployment, and you
# silently upload the entire previous database to production — the opposite of
# a clean start, and hard to notice until strangers' accounts appear.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Both files _migrate_legacy_data() reads, in the order it tries them.
_LEGACY = [p for p in (os.path.join(_ROOT, "app_data.json"), os.path.join(_ROOT, "app_data.db"))
           if os.path.exists(p)]
if _LEGACY and "--allow-legacy-migration" not in sys.argv:
    sys.exit(
        "Refusing to run — these would be migrated into the target database:\n"
        + "".join(f"  {p}\n" for p in _LEGACY)
        + "\nImporting data.py against an empty database imports them automatically,\n"
        "so seeding would also upload the old local database.\n\n"
        "Move or rename them first, or pass --allow-legacy-migration if importing\n"
        "them really is what you want."
    )

import data  # noqa: E402  (must follow the checks — it connects on import)
from utils.models import InPersonMeeting, OnlineMeeting  # noqa: E402

# Written into every record this script creates, so --undo can find them and
# nothing hand-made is ever removed by accident.
MARK = "__demo_seed__"

# Real places, so the map has pins in sensible spots rather than in the sea.
PLACES = [
    ("Dizengoff Center, Tel Aviv", 32.0753, 34.7748),
    ("Sarona Market, Tel Aviv", 32.0714, 34.7870),
    ("Hayarkon Park, Tel Aviv", 32.1020, 34.8040),
    ("Mahane Yehuda Market, Jerusalem", 31.7850, 35.2120),
    ("Weizmann Institute, Rehovot", 31.9073, 34.8100),
    ("Ness Ziona Central Park", 31.9293, 34.7986),
    ("Herzliya Marina", 32.1620, 34.7960),
    ("Old Jaffa Port", 32.0540, 34.7500),
]

IN_PERSON = [
    ("Morning run along the river", "Easy 5k, we stop for coffee after. All paces welcome.", "🏃", ["Sports", "Fitness"]),
    ("Board game night", "Bring one, borrow one. Beginners very welcome.", "🎲", ["Gaming", "Social"]),
    ("Sunset photo walk", "Golden hour around the old town. Any camera, phones included.", "📷", ["Art", "Outdoors"]),
    ("Study session: finals", "Quiet co-working, then we compare notes over pizza.", "📚", ["Study"]),
    ("Pickup basketball", "Casual, we rotate teams so nobody sits out.", "🏀", ["Sports"]),
    ("Coffee and cowork", "Laptops out, headphones on, chat on the breaks.", "☕", ["Tech", "Study"]),
    ("Farmers market wander", "Breakfast, then whatever looks good.", "🥐", ["Food & Drink", "Social"]),
]

ONLINE = [
    ("Intro to React Native", "Screen share, build a small app together. Questions any time.", "💻", ["Tech"]),
    ("Language exchange: Hebrew/English", "Half an hour each. Total beginners fine.", "🗣️", ["Social", "Study"]),
    ("Late night music listening", "Everyone queues one track and says why.", "🎧", ["Music"]),
]

DEMO_USERS = [
    ("maya.demo@example.com", "maya"),
    ("noam.demo@example.com", "noam"),
    ("tal.demo@example.com", "tal"),
    ("shira.demo@example.com", "shira"),
    ("eitan.demo@example.com", "eitan"),
    ("yael.demo@example.com", "yael"),
    ("omri.demo@example.com", "omri"),
    ("dana.demo@example.com", "dana"),
]


def real_users():
    """Accounts that are not demo seeds and are not banned."""
    return [
        uid for uid, u in data.USERS_DB.items()
        if not u.get(MARK) and not u.get("is_banned")
    ]


def ensure_users(count):
    """Create demo accounts, returning every usable uid."""
    made = []
    for email, username in DEMO_USERS[:count]:
        uid = data.register_user(email)
        user = data.USERS_DB[uid]
        user["username"] = username
        user["display_name"] = username.capitalize()
        user[MARK] = True
        made.append(uid)
    return made


def spread_over_next_days(n, days=4):
    """n datetimes across the next `days`, at hours people actually meet."""
    now = datetime.now()
    slots = []
    for i in range(n):
        day = now + timedelta(days=1 + (i % days))
        hour = random.choice([9, 10, 12, 17, 18, 19, 20])
        slots.append(day.replace(hour=hour, minute=random.choice([0, 30]), second=0, microsecond=0))
    return sorted(slots)


def seed(args):
    existing = real_users()
    creators = list(existing)

    if not creators:
        if not args.users:
            sys.exit(
                "No accounts in this database, so there is nobody to attribute\n"
                "meetings to. Re-run with --users 8 to create demo accounts too."
            )
        print(f"No existing accounts — creating {args.users} demo users.")
        creators = ensure_users(args.users)
    else:
        print(f"Attributing meetings to {len(creators)} existing account(s).")
        if args.users:
            creators += ensure_users(args.users)

    pool = list(dict.fromkeys(creators))
    when = spread_over_next_days(args.count)
    # Sample without exhausting either list: random.sample raises if asked for
    # more than it has, so a --count above the templates available reuses them
    # rather than failing.
    catalogue = IN_PERSON + ONLINE
    picks = []
    while len(picks) < args.count:
        batch = random.sample(catalogue, min(len(catalogue), args.count - len(picks)))
        picks.extend(batch)

    created = []
    for i, (title, desc, emoji, tags) in enumerate(picks[:args.count]):
        creator = random.choice(pool)
        stamp = when[i].strftime("%Y-%m-%d %H:%M")

        # Everyone except the organiser is a candidate; the organiser is added
        # first because the app treats the creator as attending.
        others = [u for u in pool if u != creator]
        # At least a couple of others, so no meeting reads "Be the first" — the
        # point of seeding is to show the app with people in it.
        want = random.randint(2, 7)
        joined = [creator] + random.sample(others, min(len(others), want))

        if (title, desc, emoji, tags) in ONLINE:
            meeting = OnlineMeeting(
                id=0, title=title, description=desc, time=stamp,
                link="https://meet.example.com/" + title.lower().replace(" ", "-")[:24],
                emoji=emoji, tags=tags, joined_uids=joined,
            )
        else:
            place, lat, lng = random.choice(PLACES)
            meeting = InPersonMeeting(
                id=0, title=title, description=desc, time=stamp,
                location=place, lat=lat, lng=lng,
                emoji=emoji, tags=tags, joined_uids=joined,
            )

        # A third of them require a minimum, so the threshold bar is visible.
        if random.random() < 0.34:
            meeting.min_attendees = random.randint(3, 6)
            meeting.commit_status = "gathering"
            meeting.join_deadline = (when[i] - timedelta(hours=6)).strftime("%Y-%m-%d %H:%M")

        data.add_meeting(meeting, creator_uid=creator)

        record = data.MEETINGS_DB[meeting.id]
        record[MARK] = True
        # add_meeting() sets pending for untrusted creators; these are meant to
        # be visible, which is the whole point of seeding them.
        record["status"] = "approved"
        # Keep each joiner's profile consistent with the meeting.
        for uid in joined:
            ids = data.USERS_DB[uid].setdefault("joined_meeting_ids", [])
            if meeting.id not in ids:
                ids.append(meeting.id)

        created.append((meeting.id, stamp, len(joined), title))

    data.save_data()

    print(f"\nCreated {len(created)} meetings:\n")
    for mid, stamp, n, title in created:
        print(f"  #{mid:<4} {stamp}   {n:>2} going   {title}")


def undo(_args):
    mids = [mid for mid, m in data.MEETINGS_DB.items() if m.get(MARK)]
    uids = [uid for uid, u in data.USERS_DB.items() if u.get(MARK)]

    for mid in mids:
        data.MEETINGS_DB.pop(mid, None)
    for user in data.USERS_DB.values():
        user["created_meeting_ids"] = [i for i in user.get("created_meeting_ids", []) if i not in mids]
        user["joined_meeting_ids"] = [i for i in user.get("joined_meeting_ids", []) if i not in mids]
    for uid in uids:
        data.USERS_DB.pop(uid, None)

    data.save_data()
    print(f"Removed {len(mids)} seeded meetings and {len(uids)} demo accounts.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--count", type=int, default=10, help="how many meetings (default 10)")
    p.add_argument("--users", type=int, default=0, help="create this many demo accounts")
    p.add_argument("--undo", action="store_true", help="remove everything this script created")
    p.add_argument(
        "--allow-legacy-migration", action="store_true",
        help="proceed even though an old app_data file would be imported into the target database",
    )
    args = p.parse_args()

    undo(args) if args.undo else seed(args)
