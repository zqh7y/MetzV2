# Deploying Metz

The app currently only works on the home Wi-Fi, because the phone talks to
`http://10.0.0.1:5051` — a laptop. This is what has to change for anyone else
to be able to use it.

Two services need a public home: the **web app** (`wsgi.py`, port 5050) and the
**mobile API** (`mobile/backend/server.py`, port 5051). They share one database
and one codebase, so they deploy from the same repository.

---

## 1 · Database

Both services read ``DATABASE_URL`` and expect one PostgreSQL database. A managed
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
| `DATABASE_URL` | Render Postgres **Internal Database URL** |
| `FIREBASE_API_KEY` | Same project as now, or sign-in breaks |
| `GMAIL_ADDRESS` | Sender for verification codes. **Without it nobody can finish signing up** — see below |
| `GMAIL_APP_PASSWORD` | Google account → Security → App passwords. Not your normal password |
| `TRUST_PROXY` | `1`. Hosts terminate TLS at a proxy; without this, client IPs and secure-cookie detection are wrong |
| `CONTACT_EMAIL` | Shown on `/privacy` |
| `MOBILE_API_PORT` | Mobile API service only |

`metz-firebase.json` is also git-ignored. Upload it as a secret file, or move
its contents into an environment variable and load it from there.

> **Signup is silently broken without the two `GMAIL_` variables.** They live
> only in the local `.env`, which is git-ignored and never uploaded, so a fresh
> deployment starts without them. `send_verification_email` used to fall back
> to printing the code to stdout wherever they were missing, which is right on
> a laptop and wrong on a server: every code went into a log nobody reads while
> the API answered `pending_verification`, so signup looked healthy and no
> email ever arrived. It now refuses outside development and the caller is told
> the send failed. Set both before letting anyone sign up.

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

## 5b · Sign in with Google (optional, but it bypasses the emailed code)

Google has already proved the person owns the address, which is the only thing
the 4-digit code establishes — so an account created this way skips
verification entirely, and works even while the `GMAIL_` variables are wrong.

The button hides itself until the client id for the running platform is set, so
shipping without this changes nothing.

1. **Firebase console → Authentication → Sign-in method → enable Google.**
   This creates an OAuth *Web client* in the linked Google Cloud project.
2. **Google Cloud console → APIs & Services → Credentials.** Copy the Web
   client id. Then create an **Android** OAuth client:
   - package name `com.metz.app`
   - SHA-1 of the signing certificate — for an EAS build this is EAS's
     keystore, not a local one. Read it with:

     ```bash
     npx eas-cli credentials -p android
     ```

     Keystore → *Download / view* shows the SHA-1 fingerprint. A debug build
     installed from `expo run:android` uses a different certificate, so add
     that SHA-1 too if you want it working there.
3. Paste both into `mobile/app/app.json`:

   ```json
   "googleAuth": {
     "webClientId": "…apps.googleusercontent.com",
     "androidClientId": "…apps.googleusercontent.com",
     "iosClientId": ""
   }
   ```

These are client *identifiers*, not secrets — they identify the app, they do
not authenticate it — so they belong in app.json rather than the environment.

The app never sees a password and never trusts an address it was handed: it
sends Google's signed ID token to `POST /api/auth/google`, which passes it to
Firebase's `signInWithIdp` and reads the address out of Firebase's answer.

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
