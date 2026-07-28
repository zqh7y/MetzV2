import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { buildTheme } from "../styles/theme";

// The web keeps these in localStorage under "pref:<key>" and reflects them as
// data-* attributes on <html> (see the bootstrap script in base.html). Same
// keys, same values, same defaults here, so the two apps agree on what every
// preference means and a user switching between them sees the same app.
export const PREF_DEFAULTS = {
  theme: "light",        // light | dark | system
  accent: "teal",        // teal | indigo | coral | amber
  density: "compact",    // compact | comfortable
  motion: "full",        // full | reduced
  minimaps: "on",        // on | off   (live maps on For You cards)
  sheet: "peek",         // peek | half | full  (Home sheet on open)
};

const PREF_KEYS = Object.keys(PREF_DEFAULTS);
const storageKey = (key) => `pref:${key}`;

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [prefs, setPrefs] = useState(PREF_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const entries = await AsyncStorage.multiGet(PREF_KEYS.map(storageKey));
        const saved = {};
        entries.forEach(([key, value]) => {
          if (value) saved[key.replace(/^pref:/, "")] = value;
        });
        setPrefs((prev) => ({ ...prev, ...saved }));
      } catch (e) {
        // Storage unavailable — fall back to the defaults rather than crash
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // "system" follows the phone; the other two are explicit, exactly as on web.
  const scheme = prefs.theme === "system" ? (systemScheme || "light") : prefs.theme;
  const theme = useMemo(() => buildTheme(scheme, prefs.accent), [scheme, prefs.accent]);

  const value = useMemo(() => {
    function setPref(key, next) {
      setPrefs((prev) => ({ ...prev, [key]: next }));
      AsyncStorage.setItem(storageKey(key), next).catch(() => {});
    }

    return {
      theme,
      scheme,
      loaded,

      // Named accessors the screens already used before the other four
      // preferences existed.
      choice: prefs.theme,
      accentName: prefs.accent,
      setTheme: (next) => setPref("theme", next),
      setAccent: (next) => setPref("accent", next),

      // The rest of the web's preference set.
      density: prefs.density,
      motion: prefs.motion,
      minimaps: prefs.minimaps,
      sheet: prefs.sheet,

      // Convenience for the two the layout asks about constantly.
      comfortable: prefs.density === "comfortable",
      reduceMotion: prefs.motion === "reduced",

      prefs,
      setPref,
      resetPrefs: () => {
        setPrefs(PREF_DEFAULTS);
        AsyncStorage.multiSet(
          PREF_KEYS.map((key) => [storageKey(key), PREF_DEFAULTS[key]])
        ).catch(() => {});
      },
    };
  }, [theme, scheme, loaded, prefs]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Screens call this instead of importing colours directly. */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
