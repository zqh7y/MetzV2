import { NativeModules, Platform } from "react-native";

import en from "./locales/en";
import he from "./locales/he";
import ar from "./locales/ar";
import ru from "./locales/ru";
import es from "./locales/es";
import fr from "./locales/fr";
import de from "./locales/de";

// The catalogs are flat maps of dotted keys, not nested objects, so a missing
// key is a one-line diff against en.js rather than a hunt through two trees.
// tools/check_locales.py compares them and is the thing that keeps the six
// translations honest as English changes.
const CATALOGS = { en, he, ar, ru, es, fr, de };

/**
 * Every language the app ships, labelled in its own name — a picker that says
 * "Hebrew" to someone who only reads Hebrew is no use to them.
 */
export const LANGUAGES = [
  { code: "en", label: "English", rtl: false },
  { code: "he", label: "עברית", rtl: true },
  { code: "ar", label: "العربية", rtl: true },
  { code: "ru", label: "Русский", rtl: false },
  { code: "es", label: "Español", rtl: false },
  { code: "fr", label: "Français", rtl: false },
  { code: "de", label: "Deutsch", rtl: false },
];

export const DEFAULT_LANGUAGE = "en";

const RTL = new Set(LANGUAGES.filter((l) => l.rtl).map((l) => l.code));

export const isRTLLanguage = (code) => RTL.has(code);

export const isSupported = (code) => Object.prototype.hasOwnProperty.call(CATALOGS, code);

/**
 * The phone's language, as a bare code we ship ("he", not "he-IL").
 *
 * expo-localization would do this, but it is a native module: adding it means
 * every contributor needs a fresh build before the app will even start. These
 * two NativeModules are already present in any React Native app, so detection
 * costs nothing and works in Expo Go today. Intl is the third choice because
 * Hermes does not guarantee it on every platform, and "en" is the last resort —
 * an app that cannot tell what language the phone is in should still open.
 */
export function detectDeviceLanguage() {
  let tag = "";
  try {
    if (Platform.OS === "ios") {
      const settings = NativeModules.SettingsManager?.settings;
      tag = settings?.AppleLocale || settings?.AppleLanguages?.[0] || "";
    } else {
      tag = NativeModules.I18nManager?.localeIdentifier || "";
    }
    if (!tag && typeof Intl !== "undefined") {
      tag = Intl.DateTimeFormat().resolvedOptions().locale || "";
    }
  } catch (e) {
    // A device that will not answer gets English rather than a crash.
  }

  // "he_IL", "he-IL" and "iw_IL" all mean Hebrew. Android still reports the
  // 1989 code "iw" on some builds, and Indonesian has the same problem, so
  // both legacy codes are mapped before the region is trimmed.
  const primary = String(tag).replace("_", "-").split("-")[0].toLowerCase();
  const legacy = { iw: "he", in: "id", ji: "yi" }[primary] || primary;
  return isSupported(legacy) ? legacy : DEFAULT_LANGUAGE;
}

/**
 * CLDR plural categories, hand-written for the seven languages we ship.
 *
 * This is not decoration. Russian needs three forms for "N meetings" and
 * Arabic six; picking the wrong one is exactly the kind of thing that makes a
 * translated app read as broken to a native speaker while looking fine to
 * everyone else. Only integers occur here — no count in this app has a
 * fractional part — so the rules are the v=0 branch of the CLDR tables.
 */
export function pluralCategory(language, count) {
  const n = Math.abs(Math.floor(Number(count) || 0));
  const mod10 = n % 10;
  const mod100 = n % 100;

  switch (language) {
    case "ru":
      if (mod10 === 1 && mod100 !== 11) return "one";
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
      return "many";
    case "ar":
      if (n === 0) return "zero";
      if (n === 1) return "one";
      if (n === 2) return "two";
      if (mod100 >= 3 && mod100 <= 10) return "few";
      if (mod100 >= 11 && mod100 <= 99) return "many";
      return "other";
    case "he":
      if (n === 1) return "one";
      if (n === 2) return "two";
      return "other";
    case "fr":
      // French counts zero with the singular: "0 réunion", not "0 réunions".
      return n === 0 || n === 1 ? "one" : "other";
    default:
      // en, es, de
      return n === 1 ? "one" : "other";
  }
}

/** Replace {name} placeholders. Unknown placeholders are left alone. */
function interpolate(template, params) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : whole));
}

function lookup(language, key, params) {
  const catalog = CATALOGS[language];
  if (!catalog) return undefined;

  // A `count` turns the key into a family: prefer this language's category,
  // then "other", then the bare key for languages that never needed a split.
  if (params && params.count !== undefined) {
    const category = pluralCategory(language, params.count);
    const candidates = [`${key}_${category}`, `${key}_other`, key];
    for (const candidate of candidates) {
      if (catalog[candidate] !== undefined) return catalog[candidate];
    }
    return undefined;
  }

  return catalog[key];
}

/**
 * Translate `key` into `language`.
 *
 * Falls back to English rather than showing nothing, because a screen with one
 * English label on it is usable and a screen with a blank label is not. If even
 * English is missing the key itself is returned, which is ugly on purpose — it
 * makes the gap obvious in a screenshot instead of silently rendering "".
 */
export function translate(language, key, params) {
  let value = lookup(language, key, params);
  if (value === undefined && language !== DEFAULT_LANGUAGE) {
    value = lookup(DEFAULT_LANGUAGE, key, params);
  }
  if (value === undefined) return key;
  return interpolate(value, params);
}

export function hasKey(language, key) {
  return lookup(language, key) !== undefined;
}

export default CATALOGS;
