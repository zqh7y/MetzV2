import { useEffect, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import {
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_AUTH_READY,
} from "../config";

// Lets the browser tab that handled the sign-in hand control straight back to
// the app instead of being left open behind it. Called at module scope because
// it patches a global handler, and doing it per-render would re-register it.
WebBrowser.maybeCompleteAuthSession();

/**
 * "Continue with Google" for the login and signup screens.
 *
 * useIdTokenAuthRequest rather than useAuthRequest: the backend hands the token
 * to Firebase's signInWithIdp, which wants Google's *ID token* (a signed JWT
 * describing who signed in), not an access token for calling Google's APIs on
 * their behalf. This app never reads anyone's Google data — it only needs to
 * know the address is genuinely theirs — so asking for an access token would
 * request more than it has any use for.
 *
 * Returns { available, busy, error, signIn }. `available` is false when no
 * client id is configured, so a screen can leave the button out rather than
 * offer something that cannot work.
 */
export default function useGoogleSignIn() {
  const { signIn: storeSession } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID || undefined,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
  });

  // The response arrives through a redirect back into the app, which is a
  // separate render from the tap — hence an effect rather than awaiting
  // promptAsync's result.
  const handled = useRef(null);
  useEffect(() => {
    if (!response) return;

    if (response.type !== "success") {
      // "dismiss" and "cancel" are someone changing their mind, which is not
      // an error and should leave the screen exactly as it was.
      if (response.type === "error") {
        setError(response.error?.message || "Google sign-in failed. Please try again.");
      }
      setBusy(false);
      return;
    }

    const idToken = response.params?.id_token || response.authentication?.idToken;
    const accessToken = response.params?.access_token || response.authentication?.accessToken;

    if (!idToken && !accessToken) {
      // On a phone the provider answers twice. Google's Android clients use
      // the authorisation-code flow, so the first answer carries only `code`;
      // expo-auth-session then exchanges it and re-answers with the tokens.
      //
      // Treating that first answer as a failure is what broke this: it showed
      // "Google didn't return a usable sign-in token" a moment before the real
      // result arrived. There is nothing wrong yet — keep the spinner and wait
      // for the second answer.
      if (response.params?.code) return undefined;

      setError("Google didn't return a usable sign-in token.");
      setBusy(false);
      return undefined;
    }

    // A redirect can be delivered more than once (returning to a screen that
    // still holds the same response object), and each delivery would otherwise
    // fire another request.
    const key = idToken || accessToken;
    if (handled.current === key) return undefined;
    handled.current = key;

    let cancelled = false;
    setBusy(true);
    // Both are sent because which one exists depends on the platform: the
    // web flow returns an id_token directly, the phone flow returns whatever
    // the code exchange produced. Firebase accepts either for Google.
    api.googleSignIn({ idToken, accessToken })
      .then((data) => {
        if (cancelled) return;
        // storeSession puts the app into its signed-in state; the navigator
        // swaps to the main stack on its own, so there is nothing to navigate.
        storeSession(data.uid, data.token);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Could not finish signing in.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => { cancelled = true; };
  }, [response, storeSession]);

  async function signIn() {
    setError(null);
    setBusy(true);
    try {
      await promptAsync();
    } catch (e) {
      setError(e?.message || "Could not open Google sign-in.");
      setBusy(false);
    }
    // busy stays true on success: the effect above clears it once the token has
    // been exchanged, so the button keeps its spinner across the redirect.
  }

  return {
    available: GOOGLE_AUTH_READY && !!request,
    busy,
    error,
    signIn,
  };
}
