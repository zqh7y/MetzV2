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
        │                        CustomTabBar, ForYouCard, AnimatedPressable,
        │                        TrustBadge, TagChip
        └── screens/             Login, Signup, Verify, Home, Create,
                                  Profile, UserProfile, AdminPending,
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

### On the Android emulator

```bash
cd mobile/app
npm run emulator          # adb reverse + expo start --go --localhost
```

Use this rather than `npm run go` when the target is the emulator. `npm run go`
passes `--host lan`, so pressing `a` sends the emulator out to the machine's
LAN address for the JS bundle — a round trip through the host's firewall, which
on Windows blocks inbound connections to `node.exe` unless someone has allowed
them. `--localhost` plus `adb reverse` keeps the whole conversation on loopback,
where there is nothing to block and no address to go stale when the machine
changes networks.

To open Expo Go by hand instead of pressing `a`:

```bash
emulator -avd metz
adb shell am start -a android.intent.action.VIEW -d "exp://10.0.2.2:8081" host.exp.exponent
```

`10.0.2.2` is the emulator's alias for the host's loopback, so that address is
firewall-proof too, whichever `--host` the dev server was started with: the
manifest handler builds the bundle URL from the `Host` header of the request it
answered, not from `--host`.

#### "Loading forever, then `JSBigFileString::fromPath - Could not open file`"

That message is the JS engine reporting that the file it was handed does not
exist on disk — it is never a syntax error or a bad import, and the bundler is
almost never at fault. Something asked the app to load its JavaScript **from a
file**, and the download that was supposed to write that file never finished.
The spinner beforehand is the retry; the throw is what is left when it gives up.

Work through it in this order:

1. **Is the dev server reachable from inside the emulator?**
   `adb shell curl -s http://10.0.2.2:8081/status` should print
   `packager-status:running`. Nothing else matters until it does. (Older system
   images ship no `curl`; `adb shell toybox wget -qO - http://10.0.2.2:8081/status`
   is the same check.)
2. **Is the bundle actually building?** Ask for it directly from the machine
   running Metro:
   `curl -s -o NUL -w "%{http_code}" "http://127.0.0.1:8081/node_modules/expo/AppEntry.bundle?platform=android&dev=true"`
   Also `200`. A cold cache takes a while — the first build is ~1300 modules —
   so give it a minute before deciding it has hung.
3. **Is Expo Go holding a half-written bundle?** Its cache survives reloads and
   a wiped emulator snapshot can leave the manifest cached with the bundle gone,
   which reproduces this every launch. `adb shell pm clear host.exp.exponent`
   and open it again.
4. **Is the emulator out of disk?** `adb shell df /data`. The dev bundle is
   ~7 MB and has to be written before it can be read.
5. **Which build variant is installed?** If this is a development build rather
   than Expo Go, check that it is `debug` and not `debugOptimized` — see the
   comment in `android/app/src/debugOptimized/res/xml/network_security_config.xml`
   for why that one used to fail exactly like this.

`adb logcat -s ReactNativeJS ReactNative expo` while the app starts shows the
failed request that precedes the throw, which is the part the error text drops.

**Before running**, edit `mobile/app/src/config.js` and point
`API_BASE_URL` at wherever `server.py` is reachable:
- Android emulator → `http://10.0.2.2:5051` (already the default)
- iOS simulator → `http://localhost:5051`
- Physical device on the same WiFi (e.g. Expo Go) → your computer's LAN IP,
  e.g. `http://10.0.0.7:5051`

### Getting the map to render (Android)

The map uses **`@maplibre/maplibre-react-native`**, which ships native code
that **Expo Go cannot load**. The map screens will look blank until you build
a **development client** once (this is also why the config plugin
`@maplibre/maplibre-react-native` is listed in `app.json`):

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
did, but with the native map actually working.

**Rebuild the dev client after this change.** Swapping `react-native-maps`
for MapLibre changed the native dependencies, so an older dev client build
will crash on the Home screen until you rebuild it.

## What's implemented

- Email/password signup with the same 4-digit email verification flow as the
  web app (code `1234` works only when the API runs with FLASK_ENV=development)
- Home: a full-screen MapLibre vector map (CARTO Voyager basemap, same as the
  web app) with clustered meeting pins, under a draggable bottom sheet with
  three snap points (peek / half / full) holding the search box, the
  **For You** shelf (Pass / Join on unseen meetings) and the nearby list
- Create meeting (in-person via map tap, or online via link), tag picker
- Profile: stats, account-status tier checklist, **My Meetings**
  (Upcoming / Past, with leave) and **Find People** search — the last two
  replace the old standalone Joined and Discover tabs
- Other users' UserProfile screens with the same stats and "member
  since"/"last online" activity rows as the web app
- Admin: pending-meeting review (approve/decline), trust toggle endpoint
- Custom floating bottom tab bar (not the default React Navigation one),
  press animations on buttons/cards, and the shared Poppins/Inter/Space
  Grotesk font system

## Known gaps vs. the web app (follow-ups, not done yet)

- Meeting pins are drawn as coloured circles rather than the web's teardrop
  SVG pin — MapLibre native icons need a bundled image asset, which this app
  doesn't have an asset pipeline for yet.
- Tapping a pin opens the MeetingDetail screen instead of the web's floating
  details card, which is the more native pattern here.
- No image upload / profile picture picker.
- The API no longer trusts a plain `X-User-Id` header: login and verify return
  a signed token (`utils/tokens.py`) that the client sends as
  `Authorization: Bearer <token>` and the server verifies on every request.
  Firebase ID token signatures are still not re-verified — see SECURITY.md.
  Fine for this project's
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
