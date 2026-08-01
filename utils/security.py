"""Cross-cutting security helpers: CSRF tokens, rate limiting, security
headers and session hardening.

Kept deliberately dependency-free so the app still runs from the same
requirements.txt. The rate limiter is in-process, which is correct for the
single-worker setup this project runs; behind multiple workers it would need
a shared store (Redis) to be accurate.
"""

import hmac
import os
import secrets
import time
from collections import defaultdict, deque

from flask import request, session, jsonify, abort

# Same rule the two apps use: anything that is not explicitly "development" is
# treated as production, so a missing variable errs towards the strict side.
_IS_PRODUCTION = os.environ.get("FLASK_ENV", "production").lower() != "development"

CSRF_SESSION_KEY = "_csrf_token"
CSRF_HEADER = "X-CSRF-Token"
CSRF_FORM_FIELD = "csrf_token"

# Methods that must not change state, so they need no CSRF token.
SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}

# Paths that legitimately take a POST before a session exists.
CSRF_EXEMPT_PREFIXES = ()


def get_csrf_token():
    """Return this session's CSRF token, creating one on first use."""
    token = session.get(CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        session[CSRF_SESSION_KEY] = token
    return token


def _submitted_token():
    return (
        request.headers.get(CSRF_HEADER)
        or request.form.get(CSRF_FORM_FIELD)
        or ""
    )


def csrf_protect():
    """before_request hook: reject state-changing requests without a valid token.

    Session cookies are sent automatically by the browser on cross-site
    requests, so without this a third-party page could make a logged-in
    admin ban a user or delete a meeting just by pointing a form at us.
    """
    if request.method in SAFE_METHODS:
        return None
    if any(request.path.startswith(p) for p in CSRF_EXEMPT_PREFIXES):
        return None

    expected = session.get(CSRF_SESSION_KEY, "")
    submitted = _submitted_token()
    if expected and submitted and hmac.compare_digest(submitted, expected):
        return None

    # fetch() callers get JSON; form posts get a plain error page.
    if request.headers.get(CSRF_HEADER) is not None or request.is_json:
        return jsonify({"error": "Invalid or missing CSRF token"}), 400
    abort(400)


# ─── Rate limiting ────────────────────────────────────────────────────────
_hits = defaultdict(deque)


def rate_limit_exceeded(bucket, limit, window_seconds):
    """Sliding-window limiter. Returns True when `bucket` is over its budget.

    Call it once per attempt; it records the attempt as a side effect.
    """
    now = time.time()
    attempts = _hits[bucket]
    while attempts and now - attempts[0] > window_seconds:
        attempts.popleft()
    if len(attempts) >= limit:
        return True
    attempts.append(now)
    return False


def client_ip():
    """Best-effort client address. X-Forwarded-For is only meaningful behind a
    proxy you control — treat it as a hint, not an identity."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def reset_rate_limits():
    """Test helper — drops all recorded attempts."""
    _hits.clear()


# ─── Response headers ─────────────────────────────────────────────────────
def add_security_headers(response):
    """Baseline headers. The CSP allows the CDNs and map/tile hosts this app
    actually uses; anything else is blocked."""
    # HSTS: once a browser has seen this, it refuses to talk to the host over
    # plain HTTP at all, which closes the window where a first request could be
    # downgraded and a session cookie read off the wire.
    #
    # Production only, and only over an already-secure connection — sending it
    # from a local HTTP dev server would pin "https only" for localhost in the
    # developer's browser and be a nuisance to undo.
    if _IS_PRODUCTION and request.is_secure:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy", "geolocation=(self), microphone=(), camera=(), payment=()"
    )
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        # Inline scripts/styles are still used by the templates, and MapLibre
        # compiles its workers from blobs.
        "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net blob:; "
        "worker-src 'self' blob:; "
        "child-src 'self' blob:; "
        # jsdelivr serves flatpickr's stylesheet — without it the date picker's
        # calendar renders unstyled and spills into the page as stray content.
        "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net "
        "https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: blob: https://*.cartocdn.com https://*.basemaps.cartocdn.com "
        "https://*.openstreetmap.org; "
        "connect-src 'self' https://*.cartocdn.com https://*.basemaps.cartocdn.com "
        "https://nominatim.openstreetmap.org https://router.project-osrm.org "
        "https://identitytoolkit.googleapis.com ws: wss:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'",
    )
    return response
