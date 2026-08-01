"""WSGI entrypoint for production.

`python app.py` starts Flask's development server, which is single-threaded
and explicitly not meant to face the internet. In production run a real WSGI
server against this module instead:

    # Linux / macOS
    gunicorn --workers 1 --threads 8 --bind 0.0.0.0:8000 wsgi:app

    # Windows
    waitress-serve --port=8000 wsgi:app

Both are optional extras — see requirements-prod.txt.

Note on workers: one, and not as a performance opinion.

data.py holds every meeting, user, report and inbox message in module-level
dicts that load_data() fills once at import. Postgres is written on every
change but only read at start-up, so a second worker starts with its own copy
and never sees the first one's writes — a meeting would appear or vanish
depending on which worker served the request. The rate limiter in
utils/security.py counts in process memory too, so N workers hands out N times
the budget.

Threads give concurrency within the single process. Scaling past that means
reading state from Postgres per request and moving the limiter to Redis.
"""

import os

from app import app

# Honour X-Forwarded-For / X-Forwarded-Proto when running behind a reverse
# proxy, so client IPs (rate limiting) and HTTPS detection (secure cookies)
# are correct. Only trust these when a proxy really is in front of the app.
if os.environ.get("TRUST_PROXY", "").lower() in ("1", "true", "yes"):
    from werkzeug.middleware.proxy_fix import ProxyFix

    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

if __name__ == "__main__":
    app.run()
