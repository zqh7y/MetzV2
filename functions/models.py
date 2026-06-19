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

    def __init__(self, id, title, description, time,
                 creator_uid=None, creator_username=None, joined_uids=None, emoji=None, tags=None, status=None):
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
        }


class InPersonMeeting(Meeting):
    """Meeting that takes place at a physical location."""

    DEFAULT_EMOJI = "📍"

    def __init__(self, id, title, description, time, location, lat, lng,
                 creator_uid=None, creator_username=None, joined_uids=None, emoji=None, tags=None, status=None):
        super().__init__(id, title, description, time, creator_uid, creator_username, joined_uids, emoji, tags, status)
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

    def __init__(self, id, title, description, time, link,
                 creator_uid=None, creator_username=None, joined_uids=None, emoji=None, tags=None, status=None):
        super().__init__(id, title, description, time, creator_uid, creator_username, joined_uids, emoji, tags, status)
        self.link = link
        self.lat = None
        self.lng = None

    def get_display_text(self):
        # Polymorphic override: specific to online meetings
        return f"[📹] {self.title} – join at {self.link} – {self.time}"

    def to_dict(self):
        d = super().to_dict()
        d.update({"link": self.link, "lat": None, "lng": None})
        return d


# ─── Algorithm 2: Input Validation (Server-Side Stage) ───────────────────────
# Two-stage validation: stage 1 runs in JavaScript before the form is sent;
# stage 2 runs here on the server with stricter checks + HTML sanitization.
# Sanitizing HTML entities prevents XSS — a user cannot inject <script> tags
# because < becomes &lt; and > becomes &gt; before the text ever touches the DOM.

MAX_TITLE_LEN = 100
MAX_DESC_LEN = 500


def sanitize_html(text):
    """Escape HTML special characters to prevent XSS injection."""
    if not isinstance(text, str):
        return ""
    return html.escape(text.strip())


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
