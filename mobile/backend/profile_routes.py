"""Own profile, viewing other users, trust toggle, and user search — mirrors
screens/profile.py from the web app."""

from flask import Blueprint, request, jsonify

from data import (
    get_user, is_admin, is_trusted, set_trusted, get_account_status,
    get_all_meetings, search_users, generate_user_color, update_profile,
    get_reliability, delete_own_account, open_report_count, unread_inbox_count,
    get_reports, profile_highlights, get_active_users,
    PROFILE_EMOJIS, MAX_DISPLAY_NAME, MAX_BIO,
    PROFILE_FRAMES, PROFILE_BACKGROUNDS, MAX_INTERESTS,
)

from routes.activity import pending_action_count

from helpers import current_uid, require_admin, serialize_meeting

profile_bp = Blueprint("profile", __name__)


def _public_reliability(record):
    """The attendance record as other people are allowed to see it.

    Settled counts are public — they are the point of the score. "pending" is
    not: it says how many finished meetings someone still owes an answer on,
    which is a prompt for the owner rather than a fact about their record.
    """
    return {k: v for k, v in record.items() if k != "pending"}


@profile_bp.route("/api/profile")
def profile():
    uid = current_uid()
    user = get_user(uid)
    if not user:
        return jsonify({"error": "unauthorized"}), 401

    return jsonify({
        "uid": uid,
        "email": user["email"],
        "username": user["username"],
        # The three editable fields, plus the limits the editor needs so the
        # client never has to hard-code rules the server actually enforces.
        "display_name": user.get("display_name") or "",
        "bio": user.get("bio") or "",
        "avatar_emoji": user.get("avatar_emoji") or "",
        "emoji_choices": PROFILE_EMOJIS,
        # Look-and-feel. The client owns the palettes and only ever sends an id
        # back, so the lists double as "what may I offer" and "what is valid".
        "profile_frame": user.get("profile_frame") or "none",
        "profile_background": user.get("profile_background") or "default",
        "frame_choices": PROFILE_FRAMES,
        "background_choices": PROFILE_BACKGROUNDS,
        "interests": user.get("interests") or [],
        "max_interests": MAX_INTERESTS,
        # False for an account that has never finished the welcome flow. Older
        # accounts predate the field and must not be sent through it again, so
        # a missing value counts as done.
        "onboarded": bool(user.get("onboarded", True)),
        "max_display_name": MAX_DISPLAY_NAME,
        "max_bio": MAX_BIO,
        "profile_picture": user.get("profile_picture"),
        "profile_color": generate_user_color(uid),
        "is_admin": is_admin(uid),
        "is_trusted": is_trusted(uid),
        "meetings_created": len(user.get("created_meeting_ids", [])),
        "meetings_joined": len(user.get("joined_meeting_ids", [])),
        # Kept so an older build of the app still renders, but the profile now
        # shows highlights instead: "swiped" counted the For You shelf, which no
        # longer exists, so the figure could never move again.
        "meetings_swiped": len(user.get("swiped_ids", [])),
        "highlights": profile_highlights(uid),
        "account_status": get_account_status(uid),
        # Your own record carries the "to confirm" count as well, because the
        # web shows it here and nowhere else — it is a prompt to go and settle
        # them, which only means anything to the person who owns them.
        "reliability": get_reliability(uid),
        # Drives the Activity badge in the drawer. Comes from the same helper
        # the web's context processor uses, so the badge and the Activity screen
        # can never disagree about how many things are waiting.
        "action_count": pending_action_count(uid),
        "unread_inbox_count": unread_inbox_count(uid),
        "pending_review_count": (
            len(get_all_meetings(status="pending", include_private=True)) if is_admin(uid) else 0
        ),
        # Drives the Reports badge in the admin section of the drawer.
        "open_report_count": open_report_count() if is_admin(uid) else 0,
        # The newest thing in each admin queue, so the badge can distinguish
        # "there is work outstanding" from "there is something you have not
        # seen". The counts alone cannot: a queue of three you have already
        # read and a queue of three where one is new look identical, so the
        # marker stayed red forever and stopped meaning anything. The client
        # remembers the highest id it has shown you and compares.
        # get_all_meetings() hands back model objects, not the stored dicts.
        "latest_pending_id": (
            max((getattr(m, "id", 0) or 0
                 for m in get_all_meetings(status="pending", include_private=True)),
                default=0) if is_admin(uid) else 0
        ),
        "latest_report_id": (
            max((r.get("id") or 0 for r in get_reports(status="open")), default=0)
            if is_admin(uid) else 0
        ),
    })


@profile_bp.route("/api/profile", methods=["POST"])
def edit_profile():
    """Update the parts of a profile the owner is allowed to change.

    Mirrors the web's edit_profile_route: capping, escaping and the emoji
    whitelist all live in data.update_profile(), so both clients get the same
    rules rather than each re-implementing validation.
    """
    uid = current_uid()
    if not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    body = request.get_json(force=True) or {}

    # Only fields actually present are touched, so a client sending just a bio
    # doesn't silently blank the display name.
    if not update_profile(
        uid,
        display_name=body.get("display_name"),
        bio=body.get("bio"),
        avatar_emoji=body.get("avatar_emoji"),
        profile_frame=body.get("profile_frame"),
        profile_background=body.get("profile_background"),
        interests=body.get("interests"),
        onboarded=body.get("onboarded"),
    ):
        return jsonify({"error": "not found"}), 404

    user = get_user(uid)
    return jsonify({
        "display_name": user.get("display_name") or "",
        "bio": user.get("bio") or "",
        "avatar_emoji": user.get("avatar_emoji") or "",
        "profile_frame": user.get("profile_frame") or "none",
        "profile_background": user.get("profile_background") or "default",
        "interests": user.get("interests") or [],
        "onboarded": bool(user.get("onboarded", True)),
    })


@profile_bp.route("/api/profile", methods=["DELETE"])
def delete_account():
    """Delete your own account, permanently.

    Required to exist in-app by the app stores, so it takes no admin and asks
    no one. The confirmation is the client's job; by the time this is called
    the decision has been made.
    """
    uid = current_uid()
    if not uid or not get_user(uid):
        return jsonify({"error": "unauthorized"}), 401

    if not delete_own_account(uid):
        return jsonify({"error": "Couldn't delete the account."}), 500

    # The session token still verifies until it expires, so tell the client to
    # drop it rather than leaving it holding a key to nothing.
    return jsonify({"status": "deleted", "signed_out": True})


def _upcoming_hosted_by(target_uid, viewer_uid, limit=3):
    """The next few meetings `target_uid` is running that `viewer_uid` may see."""
    from datetime import datetime

    now = datetime.now()
    rows = []
    for m in get_all_meetings(status="approved", viewer_uid=viewer_uid):
        if getattr(m, "creator_uid", None) != target_uid:
            continue
        # Sorting on the stored string would put "9 Sep" after "10 Sep", so the
        # timestamp is parsed rather than compared as text.
        try:
            at = datetime.strptime(getattr(m, "time", ""), "%Y-%m-%d %H:%M")
        except (TypeError, ValueError):
            continue
        if at >= now:
            rows.append((at, m))

    rows.sort(key=lambda pair: pair[0])
    return [serialize_meeting(m, viewer_uid) for _, m in rows[:limit]]


@profile_bp.route("/api/users/<uid>")
def user_profile(uid):
    user = get_user(uid)
    if not user:
        return jsonify({"error": "not found"}), 404
    return jsonify({
        "uid": uid,
        "username": user["username"],
        # A profile with nothing on it but a name is not worth opening. The
        # display name, the bio and the interests were all being collected —
        # at sign-up and in the editor — and then shown to nobody.
        "display_name": user.get("display_name") or "",
        "bio": user.get("bio") or "",
        "interests": user.get("interests") or [],
        "profile_picture": user.get("profile_picture"),
        "profile_color": generate_user_color(uid),
        "profile_frame": user.get("profile_frame") or "none",
        "profile_background": user.get("profile_background") or "default",
        "is_trusted": is_trusted(uid),
        "is_admin": is_admin(uid),
        "meetings_created": len(user.get("created_meeting_ids", [])),
        "meetings_joined": len(user.get("joined_meeting_ids", [])),
        # Kept so an older build of the app still renders, but the profile now
        # shows highlights instead: "swiped" counted the For You shelf, which no
        # longer exists, so the figure could never move again.
        "meetings_swiped": len(user.get("swiped_ids", [])),
        "highlights": profile_highlights(uid),
        "joined_at": user.get("joined_at"),
        "last_online": user.get("last_online"),
        # Their upcoming meetings, so the profile is somewhere you can act from
        # rather than a dead end. Visibility goes through get_all_meetings()
        # with the viewer's uid, which already drops anything pending,
        # cancelled, or private and not theirs — a profile page must not become
        # a way around those rules.
        "hosting": _upcoming_hosted_by(uid, current_uid()),
        "account_status": get_account_status(uid),
        # What an organiser wants to know before counting on someone.
        #
        # user_profile.html prints only went/missed for other people, keeping
        # "to confirm" to the owner. The template gets the whole dict and
        # chooses what to render; an API cannot lean on that, since anything
        # sent is readable regardless of what the client draws — so the
        # pending count is dropped here rather than merely left unrendered.
        "reliability": _public_reliability(get_reliability(uid)),
    })


@profile_bp.route("/api/users/<uid>/trust", methods=["POST"])
def trust_user(uid):
    forbidden = require_admin()
    if forbidden:
        return forbidden
    set_trusted(uid, not is_trusted(uid), current_uid())
    return jsonify({"uid": uid, "is_trusted": is_trusted(uid)})


@profile_bp.route("/api/search_users")
def search_users_route():
    q = request.args.get("q", "").strip()
    # An empty box used to answer with an empty list, so the People tab opened
    # on "type to find users" — which only helps someone who already knows a
    # name. data.get_active_users() was written for exactly this and had never
    # been wired to anything: the people worth meeting are the ones actually
    # turning up, and now that is what you land on.
    if not q:
        return jsonify(get_active_users(exclude_uid=current_uid()))
    return jsonify(search_users(q))
