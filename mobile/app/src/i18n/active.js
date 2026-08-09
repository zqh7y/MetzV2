import { DEFAULT_LANGUAGE, translate } from "./index";

// The language the UI is currently rendering in, kept outside React.
//
// Everything that renders should use useI18n() so it re-renders on a change.
// This exists for the code that cannot: utils/time.js formats a countdown from
// a plain function, and the API error mapper runs inside a catch block. Passing
// `t` down to those would mean threading it through every call site of
// formatWhen() in the app for no benefit — they are called during a render that
// the provider has already re-run.
//
// LocaleProvider assigns this during its own render, before any child renders,
// so a child calling formatWhen() always sees the language it is being drawn
// in rather than the previous one.
let active = DEFAULT_LANGUAGE;

export function setActiveLanguage(language) {
  active = language || DEFAULT_LANGUAGE;
}

export function getActiveLanguage() {
  return active;
}

/** Translate in the active language. The hook is preferred inside components. */
export function t(key, params) {
  return translate(active, key, params);
}
