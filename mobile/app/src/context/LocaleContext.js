import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { I18nManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_LANGUAGE, detectDeviceLanguage, isRTLLanguage, isSupported, translate,
} from "../i18n";
import { setActiveLanguage } from "../i18n/active";

// Stored under the same "pref:" namespace as the theme preferences, so one day
// a settings export can pick all of them up with a single prefix scan.
const STORAGE_KEY = "pref:language";

/** "system" means follow the phone, and is the default for a fresh install. */
export const SYSTEM = "system";

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  // `choice` and `loaded` are one piece of state on purpose.
  //
  // As two useStates the boot read could publish `loaded: true` in a render
  // where `choice` was still SYSTEM. The direction effect below then ran
  // against the *phone's* language instead of the stored one, decided the
  // layout was pointing the wrong way, and reloaded — throwing away the stored
  // choice a moment before it was applied. A saved Hebrew preference came back
  // as English every single launch. One object means the language is never
  // observable in a half-loaded state.
  const [state, setState] = useState({ choice: SYSTEM, loaded: false });
  const { choice, loaded } = state;
  // True once a language change has been applied that only a relaunch can
  // finish. See applyDirection below for why that is unavoidable.
  const [restartNeeded, setRestartNeeded] = useState(false);

  const deviceLanguage = useMemo(() => detectDeviceLanguage(), []);
  const language = choice === SYSTEM ? deviceLanguage : choice;

  // Non-React code (utils/time.js, the API error mapper) cannot use a hook, so
  // the resolved language is mirrored into a module the plain `t` reads.
  setActiveLanguage(language);

  useEffect(() => {
    (async () => {
      let saved = null;
      try {
        saved = await AsyncStorage.getItem(STORAGE_KEY);
      } catch (e) {
        // Storage unavailable — follow the phone rather than crash.
      }
      const valid = saved && (saved === SYSTEM || isSupported(saved)) ? saved : SYSTEM;
      setState({ choice: valid, loaded: true });
    })();
  }, []);

  /**
   * Line the native layout direction up with the language.
   *
   * React Native decides RTL once, natively, when the process starts: it flips
   * every `flexDirection: "row"` and swaps left/right styles below the JS
   * layer. `forceRTL` writes the new value and it takes effect on the next
   * launch — there is no way to re-mirror a running app, and pretending
   * otherwise produces the half-flipped screen this task was meant to avoid.
   *
   * The common case never sees this. The manifest already sets
   * supportsRtl="true", so a phone whose system language is Hebrew or Arabic
   * starts RTL on its own and picking "System default" needs no relaunch. Only
   * an in-app override that disagrees with the phone does.
   *
   * There is deliberately no development shortcut here. This used to call
   * DevSettings.reload() under __DEV__, on the theory that re-running the
   * bundle was cheaper than asking the developer to relaunch. It is not the
   * same thing: reload() restarts the *JavaScript*, while forceRTL only takes
   * effect when the *native* process starts. The guard above is therefore not
   * guaranteed to be satisfied by the reload it triggered — and this runs on
   * first load, not just on a switch, so an RTL language on an LTR process
   * could reload the bundle again the moment it came back, over and over,
   * leaving the app on its splash screen having never rendered a frame.
   * Development now takes the same relaunch path as production.
   */
  const applyDirection = useCallback((next) => {
    const wantRTL = isRTLLanguage(next);
    I18nManager.allowRTL(true);
    if (I18nManager.isRTL === wantRTL) return false;

    I18nManager.forceRTL(wantRTL);
    return true;
  }, []);

  // Also runs on first load, which is what catches the case of a stored
  // Hebrew choice on a phone that is otherwise English.
  useEffect(() => {
    if (!loaded) return;
    if (applyDirection(language)) setRestartNeeded(true);
  }, [loaded, language, applyDirection]);

  const value = useMemo(() => {
    /**
     * Persist first, re-render second.
     *
     * The obvious order — setChoice then a fire-and-forget write — loses the
     * choice whenever the new language flips the layout direction: that path
     * ends in a relaunch, which can win the race against an unawaited
     * AsyncStorage write. The app then comes back in the *old* language,
     * having apparently ignored the tap. Awaiting the write means the only
     * thing left to lose is a re-render that is about to happen anyway.
     */
    async function setLanguage(next) {
      const value = next === SYSTEM || isSupported(next) ? next : DEFAULT_LANGUAGE;
      try {
        await AsyncStorage.setItem(STORAGE_KEY, value);
      } catch (e) {
        // Unwritable storage costs the choice its persistence, not the switch.
      }
      setState((prev) => ({ ...prev, choice: value }));
    }

    return {
      /** The resolved code actually being rendered, never "system". */
      language,
      /** What the user picked — "system" or a code. The picker ticks this. */
      choice,
      deviceLanguage,
      loaded,
      restartNeeded,
      isRTL: isRTLLanguage(language),
      setLanguage,
      t: (key, params) => translate(language, key, params),
    };
  }, [language, choice, deviceLanguage, loaded, restartNeeded]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Screens call this for `t`. Reading it from context rather than importing the
 * plain `t` is what makes a component re-render when the language changes.
 */
export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used inside <LocaleProvider>");
  return ctx;
}
