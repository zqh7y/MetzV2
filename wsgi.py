"""WSGI entrypoint for production.

`python app.py` starts Flask's development server, which is single-threaded
and explicitly not meant to face the internet. In production run a real WSGI
server against this module instead:

    # Linux / macOS
    gunicorn --workers 4 --bind 0.0.0.0:8000 wsgi:app

    # Windows
    waitress-serve --port=8000 wsgi:app

Both are optional extras — see requirements-prod.txt.

Note on workers: the rate limiter in utils/security.py keeps its counters in
process memory, so with N workers a caller effectively gets N times the
budget. That is fine for a small deployment; if you scale out, move those
counters to Redis.
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
