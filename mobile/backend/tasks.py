"""Work that happens on a calendar rather than because somebody asked.

Driven by /api/tasks/cron, which an outside clock calls every few minutes. That
call exists mainly to stop the free plan putting the service to sleep; this is
what it does while it is awake.

Nothing here is a meeting reminder. Those are scheduled on the phone when you
join, exactly so they do not depend on this being called — a reminder that
arrives only if a cron service was working is not a reminder. What is here is
the part no device could produce on its own: a summary for the people running
things, built from everybody's meetings rather than from one person's.

Called often and expected to do nothing most of the time. Each job records the
day it last ran, so being called every ten minutes produces one digest a day and
not a hundred.
"""

from datetime import date, datetime, timedelta

from data import (
    USERS_DB, MEETINGS_DB, admin_uids, save_data, _meeting_start,
)
import push

# Where "the digest already went out today" is remembered. On the user record
# rather than in a module global, because the process restarts whenever Render
# redeploys or wakes, and a global would send a second one every time.
LAST_DIGEST_KEY = "last_digest_on"


def run_due_tasks(today=None):
    """Run whatever has not run yet today. Returns what it did, for the caller."""
    today = today or date.today()
    stamp = today.isoformat()

    organiser = _organiser_digest(today, stamp)
    moderator = _moderator_digest(today, stamp)

    if organiser or moderator:
        save_data()

    return {
        "ran_on": stamp,
        "organiser_digests": organiser,
        "moderator_digests": moderator,
    }


def _already_sent_today(uid, stamp, suffix):
    user = USERS_DB.get(uid)
    if not user:
        return True
    return user.get(f"{LAST_DIGEST_KEY}:{suffix}") == stamp


def _mark_sent(uid, stamp, suffix):
    user = USERS_DB.get(uid)
    if user:
        user[f"{LAST_DIGEST_KEY}:{suffix}"] = stamp


def _organiser_digest(today, stamp):
    """"You are running something tomorrow, and this is how it looks."

    Sent the day before rather than on the day: an organiser who finds out on
    the morning that four people are coming and the minimum was six has no time
    left to do anything about it, which is the only reason to tell them at all.
    """
    tomorrow = today + timedelta(days=1)
    by_host = {}

    for mid, m in MEETINGS_DB.items():
        host = m.get("creator_uid")
        if not host or m.get("status") != "approved":
            continue
        start = _meeting_start(m)
        if not start or start.date() != tomorrow:
            continue
        by_host.setdefault(host, []).append((mid, m))

    sent = 0
    for host, meetings in by_host.items():
        if _already_sent_today(host, stamp, "organiser"):
            continue

        if len(meetings) == 1:
            mid, m = meetings[0]
            going = len(m.get("joined_uids") or []) + len(m.get("guests") or [])
            minimum = int(m.get("min_attendees") or 0)
            title = m.get("title") or "Your meeting"
            if minimum and going < minimum:
                body = f"{going} of the {minimum} you need — tomorrow"
            else:
                body = f"{going} coming — tomorrow"
            push.send([host], title, body, {"type": "digest", "meetingId": mid})
        else:
            total = sum(
                len(m.get("joined_uids") or []) + len(m.get("guests") or [])
                for _, m in meetings
            )
            push.send(
                [host],
                f"{len(meetings)} meetings tomorrow",
                f"{total} people coming in total",
                {"type": "digest"},
            )

        _mark_sent(host, stamp, "organiser")
        sent += 1

    return sent


def _moderator_digest(today, stamp):
    """What is sitting in the review queue.

    Only when there is something in it. A daily "nothing to do" trains people to
    ignore the one that says there is.
    """
    waiting = [m for m in MEETINGS_DB.values() if m.get("status") == "pending"]
    if not waiting:
        return 0

    oldest = min(
        (m.get("created_at") or "") for m in waiting
    ) or ""
    age = ""
    try:
        days = (datetime.now(datetime.fromisoformat(oldest).tzinfo)
                - datetime.fromisoformat(oldest)).days
        if days >= 1:
            age = f" · oldest {days} day{'s' if days != 1 else ''} old"
    except (TypeError, ValueError):
        pass

    sent = 0
    for uid in admin_uids():
        if _already_sent_today(uid, stamp, "moderator"):
            continue
        push.send(
            [uid],
            f"{len(waiting)} waiting for review",
            f"Nobody can see them until they are approved{age}",
            {"type": "digest_review"},
        )
        _mark_sent(uid, stamp, "moderator")
        sent += 1

    return sent
