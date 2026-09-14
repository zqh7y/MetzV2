"""Sending push notifications, and deciding who gets them.

Expo brokers delivery, so this posts a batch to their endpoint and they hand it
to Google or Apple. That keeps credentials for neither in this repo.

Everything here is best effort and nothing raises. A notification is the least
important thing happening in any request that triggers one: somebody posting a
comment must not get an error because a phone that used to exist no longer
does. Failures are logged and dropped.
"""

import json
import threading
import urllib.error
import urllib.request

from data import (
    EXPO_PUSH_URL, push_tokens_for, admin_uids, clear_push_token,
    USERS_DB, MEETINGS_DB, is_admin,
)

# Expo accepts up to 100 messages per request.
BATCH = 100
TIMEOUT_SECONDS = 10


def _post(messages):
    """One batch, on a background thread. Never raises into the caller."""
    body = json.dumps(messages).encode("utf-8")
    request = urllib.request.Request(
        EXPO_PUSH_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as resp:
            answer = json.loads(resp.read().decode("utf-8") or "{}")
    except (urllib.error.URLError, OSError, ValueError) as exc:
        print(f"[Metz] push failed: {type(exc).__name__}: {exc}", flush=True)
        return

    # Expo reports per message. A token belonging to an app that was uninstalled
    # comes back as DeviceNotRegistered, and it will never work again — dropping
    # it here is the only thing that stops the list filling with dead devices.
    for sent, result in zip(messages, answer.get("data") or []):
        if result.get("status") == "error":
            detail = (result.get("details") or {}).get("error")
            if detail == "DeviceNotRegistered":
                _forget_token(sent.get("to"))
            else:
                print(f"[Metz] push rejected: {result.get('message')}", flush=True)


def _forget_token(token):
    for uid, user in USERS_DB.items():
        if token in (user.get("push_tokens") or []):
            clear_push_token(uid, token)
            return


def send(uids, title, body, data=None):
    """Push to every device of every account named, minus duplicates.

    Sent on a thread so the request that caused it does not wait on Expo. The
    caller has already done the thing worth doing — written the comment, filed
    the report — and the notification is the part nobody should wait for.
    """
    tokens = push_tokens_for([u for u in uids if u])
    if not tokens:
        return 0

    messages = [
        {
            "to": token,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": "default",
            "channelId": "default",
        }
        for token in tokens
    ]

    for start in range(0, len(messages), BATCH):
        chunk = messages[start:start + BATCH]
        threading.Thread(target=_post, args=(chunk,), daemon=True).start()

    return len(messages)


# ── The events worth interrupting somebody for ──────────────────────────────
#
# Deliberately few. Every one of these is either something addressed to the
# person, or something only they can act on. Anything that is merely news
# belongs in the inbox, which they read when they choose to.

def meeting_comment(meeting_id, author_uid, text):
    """Somebody asked something on a meeting.

    The organiser, because a question on their meeting is theirs to answer, and
    everyone else going, because a discussion nobody is told about is a
    comments box that stays empty. Never the author.
    """
    m = MEETINGS_DB.get(meeting_id) or {}
    audience = set(m.get("joined_uids") or [])
    if m.get("creator_uid"):
        audience.add(m["creator_uid"])
    audience.discard(author_uid)
    if not audience:
        return 0

    name = _display_name(author_uid)
    snippet = (text or "").strip()
    if len(snippet) > 120:
        snippet = snippet[:117] + "…"

    return send(
        sorted(audience),
        m.get("title") or "Your meeting",
        f"{name}: {snippet}",
        {"type": "comment", "meetingId": meeting_id},
    )


def meeting_joined(meeting_id, joiner_uid):
    """Somebody put their name down. Only the organiser is told."""
    m = MEETINGS_DB.get(meeting_id) or {}
    host = m.get("creator_uid")
    if not host or host == joiner_uid:
        return 0

    going = len(m.get("joined_uids") or []) + len(m.get("guests") or [])
    minimum = int(m.get("min_attendees") or 0)
    tail = f" · {going} of {minimum} needed" if minimum else f" · {going} going"

    return send(
        [host],
        m.get("title") or "Your meeting",
        f"{_display_name(joiner_uid)} is coming{tail}",
        {"type": "join", "meetingId": meeting_id},
    )


def meeting_awaiting_review(meeting_id):
    """A new meeting needs a moderator before anybody can see it."""
    m = MEETINGS_DB.get(meeting_id) or {}
    return send(
        admin_uids(),
        "A meeting is waiting for review",
        f"{m.get('title') or 'Untitled'} — by {_display_name(m.get('creator_uid'))}",
        {"type": "pending", "meetingId": meeting_id},
    )


def content_reported(target_type, target_id, reason):
    """Somebody reported something. Moderators only."""
    return send(
        admin_uids(),
        "New report",
        f"A {target_type} was reported — {reason}",
        {"type": "report", "targetType": target_type, "targetId": str(target_id)},
    )


def meeting_decided(meeting_id, approved, record=None):
    """The organiser's answer on their own meeting.

    `record` is for declining, which deletes the meeting: the caller keeps a
    copy from before the delete so this can still name it. Passing it also
    means this is only ever reached once the decision actually went through —
    an earlier version notified before the permission check, which let anyone
    tell an organiser their meeting had been refused.
    """
    m = record if record is not None else (MEETINGS_DB.get(meeting_id) or {})
    host = m.get("creator_uid")
    if not host:
        return 0
    title = m.get("title") or "Your meeting"
    return send(
        [host],
        "Approved — it's live" if approved else "Not approved",
        f"{title} " + ("is now on the map." if approved else "was not approved."),
        {"type": "decision", "meetingId": meeting_id},
    )


def _display_name(uid):
    user = USERS_DB.get(uid or "") or {}
    return user.get("display_name") or user.get("username") or "Someone"
