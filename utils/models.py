# models.py - Meeting classes demonstrating polymorphism + input validation algorithms

import html


# Fixed set of interest tags a meeting can be labeled with.
# Ten was too few to describe what people actually post — a film night, a
# language exchange and a dog walk all had to call themselves "Social".
# Stored on the meeting as the English word and translated on the way to the
# screen (see i18n/vocab.js), so adding to this list needs no migration, and an
# untranslated one shows in English rather than breaking.
#
# Order matters: the create form shows the first ten and hides the rest behind
# "show all", so the commonest go first.
AVAILABLE_TAGS = [
    "Sports", "Food & Drink", "Study", "Music", "Art",
    "Tech", "Outdoors", "Gaming", "Social", "Fitness",
    "Films", "Books", "Board Games", "Coffee", "Nightlife",
    "Language Exchange", "Photography", "Volunteering", "Dance",
    "Running", "Cycling", "Wellness", "Pets", "Crafts",
]


class Meeting:
    """Base class for all meetings."""

    DEFAULT_EMOJI = "📍"

    # Commitment lifecycle, separate from `status` (which is admin moderation):
    #   open      - ordinary meeting, no minimum
    #   gathering - has a minimum, still collecting people
    #   awaiting  - deadline passed under the minimum; the organiser must decide
    #   confirmed - minimum reached (or the organiser chose to run it anyway)
    #   cancelled - called off
    COMMIT_STATES = ("open", "gathering", "awaiting", "confirmed", "cancelled")

    # Where a meeting is in its own timeline, worked out from `time`:
    #   upcoming - more than JOIN_WINDOW_MINUTES away
    #   soon     - inside the join window, hasn't started
    #   live     - started, still within ASSUMED_DURATION_HOURS
    #   ended    - over
    PHASES = ("upcoming", "soon", "live", "ended")

    def __init__(self, id, title, description, time,
                 creator_uid=None, creator_username=None, joined_uids=None, emoji=None, tags=None, status=None,
                 min_attendees=0, max_attendees=0, join_deadline="", commit_status=None, waitlist_uids=None,
                 attendance=None, late_bails=None, comments=None, guests=None,
                 ends_at="", cost="", min_age=0):
        self.id = id
        self.title = title
        self.description = description
        self.time = time
        self.creator_uid = creator_uid
        self.creator_username = creator_username
        self.joined_uids = joined_uids or []
        self.emoji = emoji or self.DEFAULT_EMOJI
        self.tags = tags or []
        # "approved" meetings are publicly visible; "pending" ones await admin review.
        self.status = status or "approved"

        # ── The three things people ask in the comments ───────────────────
        # Each of these was already being asked on every meeting that did not
        # answer it, which is how they earned a field rather than a line in the
        # description: a question in the thread needs the organiser awake, and
        # the answer is then buried under whatever was said next.
        #
        # ends_at is "HH:MM" and not a full timestamp: it is read as "same day
        # unless it is earlier than the start, in which case the next morning",
        # which covers an evening that runs past midnight without asking anyone
        # to pick a second date.
        self.ends_at = ends_at or ""
        # Free text, not a number. "20" means nothing without a currency, and a
        # currency field is a dropdown nobody wants — "₪20", "free", "£5 at the
        # door" and "bring cash for pizza" are all things organisers say, and
        # the app has no reason to understand any of them, only to show them.
        self.cost = (cost or "").strip()
        # 0 = anyone. A number rather than free text so it can be filtered on
        # later and shown consistently as "18+" in seven languages.
        self.min_age = max(0, int(min_age or 0))

        # ── Threshold ("this only happens if enough people join") ──────────
        self.min_attendees = int(min_attendees or 0)
        self.max_attendees = int(max_attendees or 0)      # 0 = unlimited
        self.join_deadline = join_deadline or ""          # "YYYY-MM-DD HH:MM"
        self.waitlist_uids = waitlist_uids or []
        self.commit_status = commit_status or ("gathering" if self.min_attendees else "open")

        # ── Showing up ────────────────────────────────────────────────────
        # attendance: uid -> "went" | "missed", filled in after the meeting by
        # the attendee themselves or by the organiser. late_bails: uid -> ISO
        # timestamp, written when someone leaves too close to the start to be
        # replaced. Both feed the reliability score on a user's profile.
        self.attendance = dict(attendance or {})
        self.late_bails = dict(late_bails or {})

        # ── Discussion ────────────────────────────────────────────────────
        # Comments hang off the meeting rather than living in a table of their
        # own: a comment has no meaning apart from its meeting, every read is
        # "give me this meeting's comments", and deleting a meeting should take
        # its discussion with it. Nesting gets all three for free, and matches
        # how attendance and late_bails are already stored.
        # Each entry: {id, uid, username, text, created_at}
        self.comments = list(comments or [])

        # ── People who came in through the share link ──────────────────────
        # Someone the organiser sent the link to, who said they are coming
        # without making an account. They have a name and nothing else: no uid,
        # no show-up record, no way to be messaged. Kept apart from joined_uids
        # for exactly that reason — everything keyed on a uid (attendance, the
        # reliability score, blocking) has nothing to key on here.
        # Each entry: {id, name, created_at}
        self.guests = list(guests or [])

    @property
    def attending_count(self):
        """Everyone expected: members plus link guests.

        Capacity and the threshold both count heads in a room, and a guest
        takes up a place exactly like a member does.
        """
        return len(self.joined_uids) + len(self.guests)

    @property
    def has_threshold(self):
        return self.min_attendees > 0

    @property
    def spots_left(self):
        """Remaining places, or None when the meeting is uncapped."""
        if not self.max_attendees:
            return None
        return max(0, self.max_attendees - self.attending_count)

    @property
    def threshold_progress(self):
        """0-100, how close this meeting is to actually happening."""
        if not self.min_attendees:
            return 100
        return min(100, round(self.attending_count / self.min_attendees * 100))

    def get_display_text(self):
        """Base method – overridden by subclasses to provide specific display."""
        return f"{self.title} – {self.time}"

    def to_dict(self):
        """Convert object to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "time": self.time,
            "type": self.__class__.__name__,
            "creator_uid": self.creator_uid,
            "creator_username": self.creator_username,
            "joined_uids": self.joined_uids,
            # Counted together, reported separately: the organiser can see
            # which of the heads have a show-up record behind them.
            "joined_count": self.attending_count,
            "member_count": len(self.joined_uids),
            "guest_count": len(self.guests),
            "guests": self.guests,
            "emoji": self.emoji,
            "tags": self.tags,
            "status": self.status,
            "ends_at": self.ends_at,
            "cost": self.cost,
            "min_age": self.min_age,
            "min_attendees": self.min_attendees,
            "max_attendees": self.max_attendees,
            "join_deadline": self.join_deadline,
            "commit_status": self.commit_status,
            "waitlist_uids": self.waitlist_uids,
            "waitlist_count": len(self.waitlist_uids),
            "has_threshold": self.has_threshold,
            "spots_left": self.spots_left,
            "threshold_progress": self.threshold_progress,
            "attendance": self.attendance,
            "late_bails": self.late_bails,
            "comments": self.comments,
            "comment_count": len(self.comments),
            "is_online": False,
        }


class InPersonMeeting(Meeting):
    """Meeting that takes place at a physical location."""

    DEFAULT_EMOJI = "📍"

    def __init__(self, id, title, description, time, location, lat, lng, **kwargs):
        # **kwargs so shared fields (threshold, moderation, tags...) only have
        # to be declared once, on the base class.
        super().__init__(id, title, description, time, **kwargs)
        self.location = location
        self.lat = lat
        self.lng = lng

    def get_display_text(self):
        # Polymorphic override: specific to in-person meetings
        return f"[📍] {self.title} at {self.location} – {self.time}"

    def to_dict(self):
        d = super().to_dict()
        d.update({"location": self.location, "lat": self.lat, "lng": self.lng})
        return d


class OnlineMeeting(Meeting):
    """Meeting that takes place online via a link."""

    DEFAULT_EMOJI = "💻"

    def __init__(self, id, title, description, time, link, **kwargs):
        super().__init__(id, title, description, time, **kwargs)
        self.link = link
        self.lat = None
        self.lng = None

    def get_display_text(self):
        # Polymorphic override: specific to online meetings
        return f"[📹] {self.title} – join at {self.link} – {self.time}"

    def to_dict(self):
        d = super().to_dict()
        d.update({"link": self.link, "lat": None, "lng": None, "is_online": True})
        return d


# ─── Algorithm 2: Input Validation (Server-Side Stage) ───────────────────────
# Two-stage validation: stage 1 runs in JavaScript before the form is sent;
# stage 2 runs here on the server with stricter checks + HTML sanitization.
# Sanitizing HTML entities prevents XSS — a user cannot inject <script> tags
# because < becomes &lt; and > becomes &gt; before the text ever touches the DOM.

MAX_TITLE_LEN = 100
MAX_DESC_LEN = 500
# Shorter than a description on purpose: the discussion is for "running late,
# where exactly?", not for a second write-up of the meeting.
MAX_COMMENT_LEN = 300


def sanitize_html(text):
    """Normalise user-entered text for storage.

    It no longer escapes. Escaping belongs at the point of rendering, and both
    renderers already do it: Jinja auto-escapes every .html template (nothing
    here uses |safe), and React Native's <Text> draws a string as characters,
    never as markup.

    Escaping on the way *in* meant it happened twice on the web and once too
    often on mobile, so an apostrophe was stored as "&#x27;" and displayed
    that way. Anyone typing "It's fake" saw "It&#x27;s fake".

    Entities already in stored text are decoded here, so a value that is
    re-saved is repaired rather than escaped again.
    """
    if not isinstance(text, str):
        return ""
    return html.unescape(text).strip()


def validate_comment(text):
    """Validate one discussion comment. Returns a list of error strings.

    Same two-stage shape as validate_meeting_data: the app disables its send
    button on an empty box, and this is the check that actually decides, since
    the client is the one thing a server cannot trust.
    """
    errors = []
    if not text or not text.strip():
        errors.append("Comment cannot be empty.")
    elif len(text) > MAX_COMMENT_LEN:
        errors.append(f"Comment must be at most {MAX_COMMENT_LEN} characters.")
    return errors


def validate_meeting_data(title, description, time, meeting_type, location_name=None, link=None):
    """
    Validate meeting form fields on the server side.
    Returns a list of error strings (empty list means all fields are valid).
    """
    errors = []

    # Title: required, length limit
    if not title or not title.strip():
        errors.append("Title is required.")
    elif len(title) > MAX_TITLE_LEN:
        errors.append(f"Title must be at most {MAX_TITLE_LEN} characters.")

    # Description: optional, length limit.
    #
    # It was required, which is right for something strangers are deciding
    # whether to attend and wrong for "pizza at mine on Thursday" — and the
    # second is most of what gets posted. The app still insists on one for a
    # meeting meant to be found by people who do not know you; this is the
    # floor, not the house style, and a floor that refuses a real meeting
    # because its title already said everything is too high.
    if description and len(description) > MAX_DESC_LEN:
        errors.append(f"Description must be at most {MAX_DESC_LEN} characters.")

    # Time: required
    if not time or not time.strip():
        errors.append("Time is required.")

    # Type-specific fields
    if meeting_type == "inperson":
        if not location_name or not location_name.strip():
            errors.append("Location is required for in-person meetings.")
    elif meeting_type == "online":
        if not link or not link.strip():
            errors.append("Link is required for online meetings.")
        elif not (link.startswith("http://") or link.startswith("https://")):
            errors.append("Link must start with http:// or https://")
    else:
        errors.append("Meeting type must be 'inperson' or 'online'.")

    return errors


def meeting_from_dict(data):
    """Factory function: reconstruct a meeting object from a dictionary."""
    common = dict(
        creator_uid=data.get("creator_uid"),
        creator_username=data.get("creator_username"),
        joined_uids=data.get("joined_uids", []),
        emoji=data.get("emoji"),
        tags=data.get("tags", []),
        status=data.get("status", "approved"),
        # Meetings created before thresholds existed simply have none.
        min_attendees=data.get("min_attendees", 0),
        max_attendees=data.get("max_attendees", 0),
        join_deadline=data.get("join_deadline", ""),
        commit_status=data.get("commit_status"),
        waitlist_uids=data.get("waitlist_uids", []),
        # Meetings created before attendance tracking existed simply have none.
        attendance=data.get("attendance", {}),
        late_bails=data.get("late_bails", {}),
        # Meetings created before the discussion existed simply have none.
        comments=data.get("comments", []),
        # Meetings created before the share link existed simply have none.
        guests=data.get("guests", []),
        # Meetings created before these were asked for simply do not answer
        # them, and every screen treats an empty one as "not said".
        ends_at=data.get("ends_at", ""),
        cost=data.get("cost", ""),
        min_age=data.get("min_age", 0),
    )
    if data.get("type") == "InPersonMeeting":
        return InPersonMeeting(
            id=data["id"],
            title=data["title"],
            description=data["description"],
            time=data["time"],
            location=data["location"],
            lat=data["lat"],
            lng=data["lng"],
            **common,
        )
    elif data.get("type") == "OnlineMeeting":
        return OnlineMeeting(
            id=data["id"],
            title=data["title"],
            description=data["description"],
            time=data["time"],
            link=data["link"],
            **common,
        )
    else:
        # Fallback for legacy or unknown types
        return Meeting(
            id=data["id"],
            title=data["title"],
            description=data["description"],
            time=data["time"],
            **common,
        )
