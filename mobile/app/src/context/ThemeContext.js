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
  // `minimaps` (live maps on For You cards) used to sit here. The For You
  // shelf is gone, so nothing read it — it was a switch in Settings that
  // changed nothing at all. A value left in storage from before is simply
  // ignored now.
  sheet: "peek",         // peek | half | full  (Home sheet on open)
  // How big the app's text is. Not the phone's setting — this one is Metz's
  // own, so someone who wants larger type here does not have to enlarge every
  // other app on their phone to get it.
  textSize: "default",   // small | default | large | larger
};

// Multipliers rather than point sizes: every size in the app is written for
// "default", so a factor keeps the proportions between a heading and a label
// intact instead of flattening them towards one size.
export const TEXT_SCALES = { small: 0.92, default: 1, large: 1.12, larger: 1.25 };

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
  const theme = useMemo(() => {
    const base = buildTheme(scheme, prefs.accent);
    const factor = TEXT_SCALES[prefs.textSize] ?? 1;
    // `fs` is what every style calls instead of writing a bare number, so one
    // preference resizes the whole app without each screen knowing about it.
    // Rounded to a half point: fractional sizes make text land off the pixel
    // grid and look slightly soft on Android.
    return { ...base, fs: (n) => Math.round(n * factor * 2) / 2, textScale: factor };
  }, [scheme, prefs.accent, prefs.textSize]);

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
      sheet: prefs.sheet,
      textSize: prefs.textSize,

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
