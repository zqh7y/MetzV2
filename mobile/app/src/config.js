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
