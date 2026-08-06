import { NativeModules, Platform } from "react-native";
import Constants from "expo-constants";

// Where mobile/backend/server.py is listening.
const API_PORT = 5051;

// In a release build there is no dev server to borrow a host from, so this is
// the one value that has to be set by hand. It lives in app.json under
// expo.extra.apiUrl so it can be changed without touching code, and so a build
// can be pointed at a different backend without a new commit.
//
// Leaving it empty is what made every release request fail silently: fetch()
// would be handed a path with no host and report "Network request failed",
// which reads like a server problem but never left the phone.
const PRODUCTION_API_URL = (Constants.expoConfig?.extra?.apiUrl || "").replace(/\/+$/, "");

/** Pull the bare hostname out of "10.0.0.1:8081" or "http://10.0.0.1:8081/…". */
function hostFrom(value) {
  if (!value) return null;
  const withScheme = value.includes("://") ? value : `http://${value}`;
  const match = withScheme.match(/^[a-z]+:\/\/([^/:]+)/i);
  return match ? match[1] : null;
}

/**
 * Work out the API host from whoever served the JavaScript bundle.
 *
 * Hard-coding a LAN IP here breaks every time the machine gets a new address,
 * and it can never be right for the emulator (10.0.2.2) and a physical phone
 * (the laptop's LAN IP) at the same time. Metro runs on the same machine as
 * the Flask API, so borrowing its host is correct everywhere with no config.
 *
 * Two sources are tried because neither covers every runtime on its own:
 * SourceCode.scriptURL — the obvious one — is `undefined` in Expo Go on SDK 54,
 * since the New Architecture no longer exposes SourceCode as a legacy native
 * module. That silently produced an empty base URL, which turned every call
 * into a host-less relative fetch and failed as "Network request failed".
 */
function resolveApiBaseUrl() {
  // A configured apiUrl now wins in development too.
  //
  // Borrowing Metro's host assumed a Flask server on the same machine. Since
  // the database moved to Render there is no local server to borrow it for —
  // data.py requires DATABASE_URL and will not fall back to a laptop database.
  // Pointing development at the deployed API also means what you test is what
  // ships, rather than a second stack that can drift.
  //
  // To go back to a local server, clear expo.extra.apiUrl in app.json.
  if (PRODUCTION_API_URL) return PRODUCTION_API_URL;

  if (!__DEV__) return PRODUCTION_API_URL;

  // Expo Go and dev builds: "10.0.0.1:8081".
  let host = hostFrom(Constants.expoConfig?.hostUri);

  // Bare React Native, and older Expo SDKs.
  if (!host) host = hostFrom(NativeModules?.SourceCode?.scriptURL);

  // A release-style bundle (file://) has no host to borrow; fall back rather
  // than build a nonsense URL.
  if (!host) return PRODUCTION_API_URL;

  return `http://${host}:${API_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

// Where the Flask *web* app lives, as opposed to the JSON API. Only needed for
// pages the app links out to rather than renders — currently the privacy
// policy, which app stores require to be reachable from inside the app.
const WEB_PORT = 5050;

function resolveWebBaseUrl() {
  const configured = (Constants.expoConfig?.extra?.webUrl || "").replace(/\/+$/, "");
  if (configured) return configured;
  if (!__DEV__) return PRODUCTION_API_URL;   // same host in a single-service deploy

  const host = hostFrom(Constants.expoConfig?.hostUri)
    || hostFrom(NativeModules?.SourceCode?.scriptURL);
  return host ? `http://${host}:${WEB_PORT}` : "";
}

export const WEB_BASE_URL = resolveWebBaseUrl();
export const PRIVACY_URL = WEB_BASE_URL ? `${WEB_BASE_URL}/privacy` : "";
export const TERMS_URL = WEB_BASE_URL ? `${WEB_BASE_URL}/terms` : "";

// ── Sign in with Google ─────────────────────────────────────────────────
// OAuth client ids, from Google Cloud via Firebase → Authentication → Google.
// They are not secrets — a client id identifies the app, it does not
// authenticate it — so app.json is the right place for them, and they can be
// changed without a code change.
//
// GOOGLE_AUTH_READY is what the screens check: with no ids configured the
// button is hidden rather than shown and then failing on tap, because the
// error Google returns for an empty client id ("invalid_request") tells the
// person nothing they can act on.
const googleAuth = Constants.expoConfig?.extra?.googleAuth || {};
export const GOOGLE_WEB_CLIENT_ID = googleAuth.webClientId || "";
export const GOOGLE_ANDROID_CLIENT_ID = googleAuth.androidClientId || "";
export const GOOGLE_IOS_CLIENT_ID = googleAuth.iosClientId || "";

// "Configured" has to mean the id *this* platform needs, not merely that one of
// the three was filled in. expo-auth-session validates the platform's own id
// and throws during render when it is missing — "Client Id property
// `androidClientId` must be defined" — so a web id alone takes down the login
// screen on a phone rather than quietly doing nothing.
const PLATFORM_CLIENT_ID = Platform.select({
  android: GOOGLE_ANDROID_CLIENT_ID,
  ios: GOOGLE_IOS_CLIENT_ID,
  default: GOOGLE_WEB_CLIENT_ID,
});

/**
 * Expo Go cannot do Google sign-in, and no amount of configuration changes it.
 *
 * The redirect there is exp://<host>:<port>, and Google refuses any redirect
 * that is not https or a registered custom scheme — the attempt dies on
 * Google's own page with "Access blocked … Error 400: invalid_request". Expo's
 * auth proxy used to stand in as an https redirect; it was removed in SDK 48.
 *
 * The app's own scheme (com.metz.app:/oauthredirect) only exists in a build
 * that installed the manifest, so this works in the APK and a dev build, and
 * nowhere else.
 */
export const IS_EXPO_GO = Constants.executionEnvironment === "storeClient";

/** A client id exists for this platform — says nothing about whether the
  * flow can actually run here. */
export const GOOGLE_CONFIGURED = Boolean(PLATFORM_CLIENT_ID);

/** Configured *and* in a build where the redirect can come back. */
export const GOOGLE_AUTH_READY = GOOGLE_CONFIGURED && !IS_EXPO_GO;
