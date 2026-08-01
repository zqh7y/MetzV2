# models.py - Meeting classes demonstrating polymorphism + input validation algorithms

import html


# Fixed set of interest tags a meeting can be labeled with.
AVAILABLE_TAGS = [
    "Sports", "Food & Drink", "Study", "Music", "Art",
    "Tech", "Outdoors", "Gaming", "Social", "Fitness",
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
                 attendance=None, late_bails=None):
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

    @property
    def has_threshold(self):
        return self.min_attendees > 0

    @property
    def spots_left(self):
        """Remaining places, or None when the meeting is uncapped."""
        if not self.max_attendees:
            return None
        return max(0, self.max_attendees - len(self.joined_uids))

    @property
    def threshold_progress(self):
        """0-100, how close this meeting is to actually happening."""
        if not self.min_attendees:
            return 100
        return min(100, round(len(self.joined_uids) / self.min_attendees * 100))

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
            "joined_count": len(self.joined_uids),
            "emoji": self.emoji,
            "tags": self.tags,
            "status": self.status,
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

    # Description: required, length limit
    if not description or not description.strip():
        errors.append("Description is required.")
    elif len(description) > MAX_DESC_LEN:
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
