# One worker, deliberately.
#
# data.py keeps every meeting, user, report and inbox message in module-level
# dicts that load_data() fills once at import. Postgres is written on every
# change but only read at start-up, so a second worker boots its own copy and
# then never sees the first one's writes: create a meeting, refresh, and it
# appears or vanishes depending on which worker answered. The in-process rate
# limiter has the same problem — N workers means N times the budget.
#
# --threads gives concurrency inside the one process, which is what this app can
# actually support. Going multi-worker means moving that state into Postgres
# proper (read per request) and the limiter into Redis.
web: gunicorn --workers 1 --threads 8 --timeout 60 --bind 0.0.0.0:$PORT wsgi:app
