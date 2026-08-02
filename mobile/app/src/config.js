import { NativeModules } from "react-native";
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
