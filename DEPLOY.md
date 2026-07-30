# Deploying Metz

The app currently only works on the home Wi-Fi, because the phone talks to
`http://10.0.0.1:5051` — a laptop. This is what has to change for anyone else
to be able to use it.

Two services need a public home: the **web app** (`wsgi.py`, port 5050) and the
**mobile API** (`mobile/backend/server.py`, port 5051). They share one database
and one codebase, so they deploy from the same repository.

---

## 1 · Database

Both services read `MYSQL_*` and expect one MySQL 8 database. A managed
instance is the least painful option — every host below offers one, and the
free tiers are enough for a school project.

Whatever you use, note the host, port, user, password and database name.

## 2 · Environment variables

Nothing sensitive is in the repository, so every one of these has to be set on
the host. `.env` is git-ignored and will **not** be uploaded.

| Variable | Notes |
| --- | --- |
| `FLASK_ENV` | `production` — anything else exposes the Werkzeug debugger |
| `SECRET_KEY` | Long random string. Sessions are signed with it |
| `DATA_ENCRYPTION_KEY` | **Copy from the existing `.env`.** Rows are Fernet-encrypted with it; a new key makes existing data unreadable |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | From step 1 |
| `FIREBASE_API_KEY` | Same project as now, or sign-in breaks |
| `TRUST_PROXY` | `1`. Hosts terminate TLS at a proxy; without this, client IPs and secure-cookie detection are wrong |
| `CONTACT_EMAIL` | Shown on `/privacy` |
| `MOBILE_API_PORT` | Mobile API service only |

`metz-firebase.json` is also git-ignored. Upload it as a secret file, or move
its contents into an environment variable and load it from there.

## 3 · Web app

`Procfile` already declares the command:

```
web: gunicorn --workers 2 --threads 4 --timeout 60 --bind 0.0.0.0:$PORT wsgi:app
```

Build command: `pip install -r requirements.txt -r requirements-prod.txt`

> **Worker count matters.** The rate limiter in `utils/security.py` keeps its
> counters in process memory, so N workers give a caller N times the budget.
> Two is a reasonable compromise; if you scale past that, move those counters
> into Redis.

## 4 · Mobile API

Second service, same repo, different command:

```
gunicorn --workers 2 --threads 4 --bind 0.0.0.0:$PORT mobile.backend.server:app
```

`mobile/backend/server.py` adds the repository root to `sys.path` on import, so
it works from the project root without extra configuration.

## 5 · Point the app at it

Once the mobile API has a public HTTPS URL, change one line in
`mobile/app/app.json`:

```json
"extra": { "apiUrl": "https://your-api-host" }
```

Then rebuild:

```bash
cd mobile/app && npx eas-cli build --platform android --profile preview
```

**Once that URL is HTTPS, delete `android:usesCleartextTraffic="true"` from
`mobile/app/android/app/src/main/AndroidManifest.xml`.** It only exists because
the API is currently plain HTTP on a LAN, and leaving it on lets any future
build talk to unencrypted hosts.

## 6 · Checks

- `GET /healthz` on the web app returns `{"status": "ok"}`
- `GET /api/health` on the mobile API returns the same
- `/privacy` loads **without signing in** — Google Play reviewers need this
- Sign in on the deployed web app before submitting the APK; a Firebase key
  scoped to the wrong domain fails only at runtime

## What still needs doing by hand

- **Creating the hosting and database accounts.** Sign-ups need a human.
- **Migrating existing data.** The current rows live in MySQL on the laptop;
  dump and restore them, and keep `DATA_ENCRYPTION_KEY` identical or the
  encrypted columns will not decrypt.
