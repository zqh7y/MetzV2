# Metz Mobile

A React Native (Expo) port of the Metz web app, talking to a JSON API that
shares the exact same business logic as the Flask web app — same `data.py`,
same `functions/models.py`, same Firebase project. There is no second
implementation of meetings, trust/moderation, tags, or account-status tiers;
`mobile/backend/api.py` just exposes the existing logic as JSON instead of
HTML.

```
mobile/
├── backend/        Flask JSON API (reuses ../../data.py, ../../functions/)
│   ├── admin_routes.py     pending-meeting review (approve/decline)
│   ├── auth_routes.py      signup / verify / login
│   ├── helpers.py          shared current_uid()/require_admin()/serializer
│   ├── meeting_routes.py   browse, create, join/pass, delete, joined list
│   ├── profile_routes.py   own profile, other users, trust toggle, search
│   └── server.py           entry point — registers all blueprints, run this
└── app/             React Native (Expo) app
    ├── App.js
    └── src/
        ├── api.js              fetch wrapper for every endpoint
        ├── config.js           API_BASE_URL — change this per device/emulator
        ├── context/AuthContext.js
        ├── components/         MeetingCard, TrustBadge, TagChip
        └── screens/            Login, Signup, Verify, Home, Discover,
                                 Create, Joined, Profile, AdminPending,
                                 MeetingDetail
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
`app_data.json` file, not the same live memory).

## Running the app

```bash
cd mobile/app
npm install
npx expo start
```

Then press `a` for Android emulator, `i` for iOS simulator, or scan the QR
code with Expo Go on a physical device.

**Before running**, edit `mobile/app/src/config.js` and point
`API_BASE_URL` at wherever `api.py` is reachable:
- Android emulator → `http://10.0.2.2:5051` (already the default)
- iOS simulator → `http://localhost:5051`
- Physical device → `http://<your-computer's-LAN-IP>:5051`

## What's implemented

- Email/password signup with the same 4-digit email verification flow as the
  web app (code `1234` always works locally, same as web)
- Home feed with map pins + searchable list, trust badges, tags
- Create meeting (in-person via map tap, or online via link), tag picker
- Discover (join/pass), Joined meetings (leave), Profile with the same
  account-status tier checklist as the web app
- Admin: pending-meeting review (approve/decline), trust toggle endpoint

## Known gaps vs. the web app (follow-ups, not done yet)

- No marker **clustering** on the mobile map yet (web app has it via
  leaflet.markercluster) — `react-native-maps` markers render individually.
  `react-native-map-clustering` is the natural next step.
- Discover screen uses tap-to-join/pass instead of true swipe gestures.
- No image upload / profile picture picker.
- The API trusts `X-User-Id` the same way the web app trusts its session
  cookie (no Firebase token signature verification). Fine for this project's
  current security model, but worth hardening before any real deployment.
- `app_data.json` is still a flat file — convert to a real database before
  shipping a mobile client that might hit the API concurrently from
  multiple devices.
