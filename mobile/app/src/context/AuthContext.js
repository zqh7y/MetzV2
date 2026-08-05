import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, loadStoredUid, loadStoredToken, setSession } from "../api";
import {
  listAccounts, rememberAccount, clearAccountToken, forgetAccount, canSwitchTo,
} from "../accounts";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [uid, setUid] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);
  // Which auth screen to show after signing out — see signOut below.
  const [authLanding, setAuthLanding] = useState("Login");
  // Other accounts this device has signed into, for one-tap switching.
  const [accounts, setAccounts] = useState([]);

  const reloadAccounts = useCallback(async () => {
    setAccounts(await listAccounts());
  }, []);

  useEffect(() => {
    (async () => {
      const stored = await loadStoredUid();
      if (stored) {
        setUid(stored);
        await refreshProfile();
      }
      await reloadAccounts();
      setBooting(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshProfile() {
    try {
      const p = await api.getProfile();
      setProfile(p);
      // Keep the switcher entry current: the name, colour and emoji shown next
      // to an account come from here, so a rename is reflected the next time
      // it appears in the list rather than staying whatever it was at sign-in.
      if (p?.uid) {
        await rememberAccount({
          uid: p.uid,
          email: p.email,
          name: p.display_name || p.username,
          emoji: p.avatar_emoji,
          color: p.profile_color,
          token: await loadStoredToken(),
        });
        reloadAccounts();
      }
      return p;
    } catch (e) {
      return null;
    }
  }

  function signIn(newUid, token) {
    setSession(newUid, token);
    setUid(newUid);
    // Recorded immediately with what is known now; refreshProfile fills in the
    // name and colour a moment later. Waiting for the profile would lose the
    // account entirely if that request failed.
    rememberAccount({ uid: newUid, token }).then(reloadAccounts);
    refreshProfile();
  }

  /**
   * Sign out, optionally saying which auth screen to land on.
   *
   * Signing out swaps the whole navigator over to the auth stack, so the
   * screen it opens on is decided there rather than by navigating. "Create a
   * new account" would otherwise drop you on Login and make you find Signup
   * yourself, which is the thing you just said you did not want.
   *
   * `keepSession` is the difference between switching and leaving. Switching
   * keeps this account's token so you can come straight back; logging out
   * drops it, because otherwise "log out" would leave the next person holding
   * the phone one tap from being signed back in as you.
   */
  function signOut({ next, keepSession = false } = {}) {
    const leaving = uid;
    setAuthLanding(next === "Signup" ? "Signup" : "Login");
    setSession(null, null);
    setUid(null);
    setProfile(null);
    if (leaving && !keepSession) {
      clearAccountToken(leaving).then(reloadAccounts);
    } else {
      reloadAccounts();
    }
  }

  /**
   * Become another saved account without a password.
   *
   * Returns false when the stored token has expired, so the caller can send
   * them to Login instead of switching into an account whose every request
   * would come back 401.
   */
  function switchTo(account) {
    if (!canSwitchTo(account)) return false;
    setProfile(null);
    setSession(account.uid, account.token);
    setUid(account.uid);
    rememberAccount({ uid: account.uid }).then(reloadAccounts);
    refreshProfile();
    return true;
  }

  function forget(targetUid) {
    return forgetAccount(targetUid).then(reloadAccounts);
  }

  return (
    <AuthContext.Provider
      value={{
        uid, profile, booting, signIn, signOut, refreshProfile, authLanding,
        accounts, switchTo, forget,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
