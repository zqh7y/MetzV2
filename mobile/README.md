# Metz Mobile

A React Native (Expo) port of the Metz web app, talking to a JSON API that
shares the exact same business logic as the Flask web app — same `data.py`,
same `utils/models.py`, same Firebase project. There is no second
implementation of meetings, trust/moderation, tags, or account-status tiers;
the route modules in `mobile/backend/` just expose the existing logic as
JSON instead of HTML. The UI mirrors the web app's look (same gradients,
cards, and a shared Poppins/Inter/Space Grotesk font system) rather than
being a from-scratch design.

```
mobile/
├── backend/        Flask JSON API (reuses ../../data.py, ../../utils/)
│   ├── admin_routes.py     pending-meeting review (approve/decline)
│   ├── auth_routes.py      signup / verify / login
│   ├── helpers.py          shared current_uid()/require_admin()/serializer
│   ├── meeting_routes.py   browse, create, join/pass, delete, joined list
│   ├── profile_routes.py   own profile, other users, trust toggle, search
│   └── server.py           entry point — registers all blueprints, run this
└── app/             React Native (Expo) app
    ├── App.js              navigation tree, font loading, custom tab bar wiring
    └── src/
        ├── api.js              fetch wrapper for every endpoint
        ├── config.js           API_BASE_URL — change this per device/emulator
        ├── context/AuthContext.js
        ├── styles/fonts.js      Poppins/Inter/Space Grotesk font name constants
        ├── components/          AuthLayout, AuthField, AuthButton, MeetingCard,
        │                        CustomTabBar, MapMarker, AnimatedPressable,
        │                        TrustBadge, TagChip
        └── screens/             Login, Signup, Verify, Home, Discover,
                                  Create, Joined, Profile, UserProfile,
                                  AdminPending, MeetingDetail
```

## Running the backend

From the **project root** (not this folder), with the same virtualenv you
already use for the Flask web app:

```bash
python mobile/backend/server.py
```

This starts on **port 5051** (the existing web app stays on 5050 — both can
run at the same time, they share the same in-memory `data.py` state only if
run in the *same* process, so for now treat them as two views into the same
**encrypted MySQL database** — not the same live memory — since `data.py`
persists every change to MySQL (Fernet/AES-encrypted blobs) rather than to a
flat file.

## Running the app

This project targets **Expo SDK 54**, which requires **Node.js 20.19.4+**
(react-native 0.81 / Metro will fail with cryptic `toReversed is not a
function` errors on older Node — check `node --version` if `expo start`
won't boot). If you're on an older Node, install
[nvm-windows](https://github.com/coreybutler/nvm-windows) and run
`nvm install 20.19.4 && nvm use 20.19.4` first.

```bash
cd mobile/app
npm install
npx expo start
```

Then press `a` for Android emulator, `i` for iOS simulator, or open the
connection URL with **Expo Go** on a physical device (scan the QR code, or
enter it manually as `exp://<your-computer's-LAN-IP>:8081`).

**Before running**, edit `mobile/app/src/config.js` and point
`API_BASE_URL` at wherever `server.py` is reachable:
- Android emulator → `http://10.0.2.2:5051` (already the default)
- iOS simulator → `http://localhost:5051`
- Physical device on the same WiFi (e.g. Expo Go) → your computer's LAN IP,
  e.g. `http://10.0.0.7:5051`

### Getting the map to render (Android)

Since Expo SDK 51, **Expo Go can't load `react-native-maps`** — it needs
native code that Expo Go doesn't bundle. The map screens will look blank
until you build a **development client** once:

```bash
cd mobile/app
npx expo install expo-dev-client
npx eas-cli login          # one-time, free Expo account
npx eas-cli init           # links this project to your Expo account
npx eas-cli build --profile development --platform android
```

The build runs in Expo's cloud (~10–15 min) and gives you a link/QR code to
install an APK on your phone. After that one-time install, keep using
`npx expo start` as normal — the dev client hot-reloads JS just like Expo Go
did, but with `react-native-maps` actually working.

## What's implemented

- Email/password signup with the same 4-digit email verification flow as the
  web app (code `1234` always works locally, same as web)
- Home feed: full-screen map with custom emoji marker pins (matching the
  web's `.meeting-marker-circle` look) + a floating searchable list panel
- Create meeting (in-person via map tap, or online via link), tag picker
- Discover: tap-to-join/pass on a **Meetings** tab, plus a **People** tab to
  search other users by username/email/ID and open their profile
- Joined meetings (leave), Profile and other users' UserProfile screens with
  the same account-status tier checklist, stats, and "member since"/"last
  online" activity rows as the web app
- Admin: pending-meeting review (approve/decline), trust toggle endpoint
- Custom floating bottom tab bar (not the default React Navigation one),
  press animations on buttons/cards, and the shared Poppins/Inter/Space
  Grotesk font system

## Known gaps vs. the web app (follow-ups, not done yet)

- No marker **clustering** on the mobile map yet (web app has it via
  leaflet.markercluster) — `react-native-maps` markers render individually.
  `react-native-map-clustering` is the natural next step.
- Discover screen uses tap-to-join/pass instead of true swipe gestures.
- No image upload / profile picture picker.
- The API trusts `X-User-Id` the same way the web app trusts its session
  cookie (no Firebase token signature verification). Fine for this project's
  current security model, but worth hardening before any real deployment.
- No **admin dashboard** equivalent yet — `mobile/backend/admin_routes.py`
  only exposes pending-meeting approve/decline and trust toggle. The web
  app's `/admin/dashboard` (ban/unban and delete users, see
  [`../routes/admin.py`](../routes/admin.py)) hasn't been ported to a mobile
  screen or API route.
- No live attendee-count updates on mobile — the web app pushes updates over
  a standalone WebSocket server ([`../socket_server.py`](../socket_server.py)),
  which the mobile app doesn't connect to yet; counts only refresh when a
  screen re-fetches.
