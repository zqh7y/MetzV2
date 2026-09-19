# Metz — read this first

Student project by Artem (software engineering track, Holtz Metz). A meetup app:
people post local meetings, others find them on a map and join.

**The phone app is the product. The web app is not.** See "Scope" below.

**There are two phone apps, from one codebase.** `mobile/app/` builds both:
Metz (`com.metz.app`) and **Metz Host** (`com.metz.host`) — three screens for
posting a meeting and sending the link round, meant to seed the map with real
meetings before Metz launches. `src/variant.js` reads `EXPO_PUBLIC_METZ_APP`,
set per EAS profile; gradle product flavours give the two different application
ids. There is no separate folder and there should not be: one api client, one
theme, one set of seven catalogs, one bug fixed once. Run Host with
`EXPO_PUBLIC_METZ_APP=host npx expo start`; build it with `--profile
preview-host`.

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

- **There is no email verification.** Removed on the owner's instruction:
  signup creates the account and returns a session, and login adopts a Firebase
  account that has no Metz account yet. The accepted cost is squatting — an
  address you do not own can be taken — and the recovery is Firebase's password
  reset, which mails the real owner. The *web* app still has its code step.
- **Mail goes out over Resend, not SMTP.** Render blocks outbound SMTP
  entirely, so Gmail can never work from there: the failure is
  `OSError: [Errno 101] Network is unreachable`, which looks nothing like a
  mail problem. `RESEND_API_KEY` is the live path; `GMAIL_*` is kept for hosts
  that permit SMTP. Only password resets send mail now.
- **Each app needs its own Android OAuth client.** A client is bound to one
  package name and the redirect is built from the application id, so Host
  cannot borrow Metz's — `app.json` holds `androidClientId` and
  `androidClientIdHost`, and `config.js` picks by variant. Host falls back to
  nothing rather than to Metz's id, because a button that always fails is worse
  than one that is not there. Verified working in a Host build.
- **Google sign-in works, and needed a setting outside this repo.** Expo Go
  cannot do it at all (its `exp://` redirect is rejected), so the button is
  greyed out there. In a real build it failed with "Access blocked … Error 400:
  invalid_request", whose detail panel says **"Custom URI scheme is not enabled
  for your Android client"** — a toggle on the Android OAuth client in Google
  *Cloud* Console, which the Firebase console does not expose. The signing
  SHA-1 also belongs on the Firebase Android app, but that was not the cause.
  Read the detail panel before changing anything; the visible error names
  neither.
- On Android the Google flow is **code + exchange**, so `expo-auth-session`
  answers twice — first with only `code`, then with the tokens. Do not treat
  the first answer as a failure.

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
- **Expo Go is not the shipped app.** A released APK can be installed straight
  onto the emulator — `eas build:list --json` gives the artifact URL, then
  `adb install -r`, and logcat is real. Worth doing whenever a report only
  happens "in the app I downloaded": the blank map on Home was a native
  renderer that Expo Go never loads, so no screenshot taken there could have
  shown it. There is one map now, WebView and Leaflet, for that reason.

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

## Next missions, roughly in order

**1 — Blocked on the owner. Ask, do not work around.**
- `CRON_SECRET` on Render, plus a free external cron calling
  `/api/tasks/cron?secret=…` every ten minutes. Until then the service sleeps
  after fifteen idle minutes — the ~22s wake-up lands on whoever opens the app
  first — and the daily digests never run. The endpoint answers 404 with the
  variable unset, deliberately.
- `--workers 1` on Render. Until then two processes can delete each other's
  rows. Check this before investigating any "data vanished" report.

**2 — Never actually observed working. Do not claim otherwise.**
- (Google sign-in came off this list: verified end to end in a Metz Host build
  on a real phone, with its own `com.metz.host` OAuth client.)
- Push notifications arriving on a device. The server side is tested and the
  token round-trip works, but no push has been seen landing. Expo Go cannot
  receive them at all, so proving it needs a real build.
- The "you are here" marker. The emulator will not produce a GPS fix.
- `useAutoRefresh`'s 20/25/30s interval. Focus refetch has been seen; the
  timer has not. Proving it means changing data from outside the app and
  watching a screen update untouched.

**3 — Two Activity sections are still dead ends.**
"Did you go?" answers inline now, but **"Mark who came"** and **"Your call"**
open the meeting detail screen, which has no UI for either — and the mobile API
has no route for either. `data.set_attendance()` and `data.decide_threshold()`
exist and are unused by the app. Finishing these means an endpoint plus real UI:
attendance needs a per-attendee went/missed list, and a threshold decision has
three outcomes including setting a new deadline, so neither collapses into two
buttons on a row.

**4 — Guests can be added but never removed.**
`/m/<id>` lets someone join with a name, deliberately with no way to cancel. The
organiser has no way to remove one either, so a mistyped or fake name is
permanent and keeps occupying capacity. A remove action for the organiser is
the missing half.

**5 — The per-request full database rewrite.**
Cheapest real win: stop `touch_last_online` calling `save_data()` on every
request — update memory and persist at most every few minutes. The deeper fix
(writing only changed rows) is a bigger job worth scoping on its own.

**6 — Play submission leftovers.**
Data-safety form, a public account-deletion URL, store assets, and confirming
`versionCode` before the first upload.

**Smaller:** `api.passMeeting` is now unused by the app (the For You shelf was
its only caller) — the endpoint still exists server-side. `README.md` is stale:
it describes MySQL and the "For You" shelf, both gone.

## House style

Comments explain **why**, not what — including what was tried before and why it
was wrong. Match the surrounding density; this codebase comments heavily and
deliberately. Prefer fixing the cause over the symptom, and say plainly when
something is unverified rather than implying it works.
