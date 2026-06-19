import React, { createContext, useContext, useEffect, useState } from "react";
import { api, loadStoredUid, setCurrentUid } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [uid, setUid] = useState(null);
  const [profile, setProfile] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await loadStoredUid();
      if (stored) {
        setUid(stored);
        await refreshProfile();
      }
      setBooting(false);
    })();
  }, []);

  async function refreshProfile() {
    try {
      const p = await api.getProfile();
      setProfile(p);
      return p;
    } catch (e) {
      return null;
    }
  }

  function signIn(newUid) {
    setCurrentUid(newUid);
    setUid(newUid);
    refreshProfile();
  }

  function signOut() {
    setCurrentUid(null);
    setUid(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ uid, profile, booting, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
