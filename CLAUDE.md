# Metz — read this first

Student project by Artem (software engineering track, Holtz Metz). A meetup app:
people post local meetings, others find them on a map and join.

**The phone app is the product. The web app is not.** See "Scope" below.

## Scope — what to work on

| Path | What it is | Touch it? |
| --- | --- | --- |
| `mobile/app/` | Expo / React Native app. **This is the product.** | Yes |
| `mobile/backend/` | Flask JSON API the app talks to. Deployed. | Yes |
| `data.py`, `utils/` | Shared data layer and models, used by both. | Yes |
| `templates/share_*.html` | Public share page, served by the mobile API. | Yes |
| `app.py`, `routes/`, other `templates/` | The old server-rendered web app. **A test app the owner does not use.** | **No — do not modify or "fix" it** |

The owner has said twice to leave the web app alone. `routes/login.py` has one
uncommitted change from before that instruction; leave it as it is.

## Deployment

- **Mobile API** → Render, `https://metz-api.onrender.com`, auto-deploys from
  `main`. Usually live ~60s after a push; if `/api/...` still shows old
  behaviour after a few minutes, the build failed — the owner must check the
  Render dashboard, you cannot see it.
- **Web app** → not deployed anywhere.
- **Database** → real PostgreSQL on Render, rows Fernet-encrypted.
- **Render free tier sleeps.** First request after ~15 idle minutes takes
  **~22 seconds**. This is the single most common "the app is broken /
  where are my meetings" report. Warm it with
  `curl https://metz-api.onrender.com/api/health` before concluding anything.

## Data layer — know this before changing it

`data.py` loads the **entire database into memory** at import (`MEETINGS_DB`,
`USERS_DB`, `REPORTS_DB`, `INBOX_DB`) and `save_data()` **rewrites every row of
every table** on each call, on a fresh connection. There are 28 call sites, and
one of them (`touch_last_online`) runs in a `before_request` hook — so **every
API request rewrites the whole database.** Fine at today's size, O(everything)
as it grows.

**Unfixed risk:** `DEPLOY.md` prescribes `gunicorn --workers 2`. Two processes
each hold their own full copy; worker B's `DELETE ... WHERE id <> ALL(...)` can
delete rows worker A just created. The owner has been told to set `--workers 1`.
Check whether they did before debugging any "data disappeared" report.

You **cannot run the backend locally** — there is no `DATABASE_URL` in `.env`.
To test backend logic, stub `psycopg` and import `data` (see "Verifying" below).

## Auth

Firebase for credentials; the API then issues its own HMAC token
(`utils/tokens.py`, `uid|expiry`, 30 days) sent as `Authorization: Bearer`.

- **Email signup is broken in production.** `GMAIL_ADDRESS` /
  `GMAIL_APP_PASSWORD` are not set on Render, so `/api/signup` returns 502.
  Only the owner can fix that. Verify with a POST before assuming otherwise.
- **Google sign-in works only in a real build.** Expo Go's redirect is
  `exp://…`, which Google rejects outright ("Access blocked, Error 400"). This
  is not fixable in config. The app detects Expo Go and greys the button out.
- On Android the Google flow is **code + exchange**, so `expo-auth-session`
  answers twice — first with only `code`, then with the tokens. Do not treat
  the first answer as a failure.
- **Uncommitted on purpose:** a fix in `mobile/backend/auth_routes.py` making
  login refuse unverified accounts. It is held back because it would demand a
  verification code the server currently cannot send. **Ship it only after the
  Gmail variables are set.**

## What exists

Meetings on a map, Explore with server-side filters, Activity ("what needs
you"), per-meeting discussions, an inbox that writes itself on read
(`sync_inbox`), account switching with saved tokens, and a **public share page**
at `/m/<id>` where someone with no account can see a meeting and join with just
a name — guests count toward capacity and the threshold, and appear in the app
tagged "via link".

Account status tiers are earned by **attending**, show-up rate, and account
age — never by posting, which was farmable. Trusted and Moderator are granted
by hand; the app tells people to contact the developer rather than showing a
progress bar that never fills.

## Verifying your work — do this, don't skip it

- **JS compiles:** `curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:8081/node_modules/expo/AppEntry.bundle?platform=android&dev=true"`
  → 200 means the bundle built. This catches syntax and import errors only.
- **Actually look at it.** Boot the emulator (`emulator -avd metz`), then
  `adb shell am start -a android.intent.action.VIEW -d "exp://10.0.2.2:8081" host.exp.exponent`,
  then `adb exec-out screencap -p > shot.png` and read the image. Several real
  bugs this session were invisible until rendered — a tofu icon, an account
  listed in its own switcher, a grey slab behind unread rows.
- **Backend logic:** import `data` with a stubbed `psycopg` module and
  `data.save_data = lambda: None`, seed `MEETINGS_DB` / `USERS_DB` by hand, and
  call the function. Flask routes can be exercised with `app.test_client()`.
- The emulator has **no GPS fix** and `adb emu geo fix` does not work on it, so
  "you are here" cannot be verified there. Say so rather than claiming it works.

## Build and release

- `npx eas-cli@latest build --platform android --profile preview` → installable
  APK. The globally installed `eas-cli` is too old for `eas.json`; always use
  `npx …@latest`.
- **EAS builds from committed git state.** Uncommitted work is not in the build.
- Uploads intermittently fail on Windows with `ENOTEMPTY`. Clear
  `%LOCALAPPDATA%\Temp\eas-cli-nodejs` and retry — it has worked every time.
- `production` profile produces an AAB (Play upload only, not installable).

## Google Play readiness

Done: unused permissions removed, `/privacy` and `/terms` served publicly,
account deletion exists in-app, bans enforced API-wide.
Outstanding: data-safety form, a public account-deletion URL, store assets,
and confirming `versionCode` before the first upload.

## House style

Comments explain **why**, not what — including what was tried before and why it
was wrong. Match the surrounding density; this codebase comments heavily and
deliberately. Prefer fixing the cause over the symptom, and say plainly when
something is unverified rather than implying it works.
