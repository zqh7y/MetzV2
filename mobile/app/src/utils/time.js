// Port of static/time-utils.js, now translated.
//
// These are plain functions called from render bodies all over the app, so they
// read the active language from ../i18n/active rather than taking a `t`
// argument — threading one through every formatWhen() call site would touch
// dozens of files to say the same thing. LocaleProvider sets that language
// during its own render, before any caller runs.
import { t } from "../i18n/active";

/** "2026-08-06 12:00" -> Date, or null if the server sent something odd. */
export function parseTime(value) {
  if (!value) return null;
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatTimeUntil(timeStr) {
  if (!timeStr) return "";
  const target = parseTime(timeStr);
  if (!target) return timeStr;

  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return t("time.alreadyStarted");

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(t("time.days", { count: days }));
  if (hours > 0) parts.push(t("time.hoursShort", { count: hours }));
  if (days === 0 && hours === 0) parts.push(t("time.minutesShort", { count: minutes }));

  return t("time.leftTillStart", { parts: parts.join(` ${t("time.and")} `) });
}

/** A ticking clock rather than a rounded phrase. */
export function formatCountdown(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  // Unit letters are translated too: "d/h/m/s" mean nothing in Hebrew or Russian.
  const d = t("time.unitD", { count: days });
  const h = t("time.unitH", { count: hours });
  const m = t("time.unitM", { count: minutes });
  const sec = t("time.unitS", { count: seconds });

  if (days > 0) return `${d} ${h} ${m}`;
  if (hours > 0) return `${h} ${m}`;
  if (minutes > 0) return `${m} ${sec}`;
  return sec;
}

// Looked up per call rather than built once at import: a module-level array
// would freeze whatever language the app started in.
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const dayName = (i) => t(`date.${DAY_KEYS[i]}`);
export const monthName = (i) => t(`date.${MONTH_KEYS[i]}`);
const pad = (n) => String(n).padStart(2, "0");

/**
 * "Today · 18:00" / "Tomorrow · 09:30" / "Fri 31 Jul · 18:00".
 *
 * Cards were printing the stored string verbatim — "2026-06-11 08:00" — which
 * is a database value, not a date anyone reads. Today and tomorrow are named
 * because that is the distinction worth making at a glance; the year is dropped
 * unless it differs from the current one.
 */
export function formatWhen(timeStr) {
  const at = parseTime(timeStr);
  if (!at) return timeStr || "";

  const now = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (sameDay(at, now)) return `${t("time.today")} · ${clock}`;
  if (sameDay(at, tomorrow)) return `${t("time.tomorrow")} · ${clock}`;

  const year = at.getFullYear() === now.getFullYear() ? "" : ` ${at.getFullYear()}`;
  return `${dayName(at.getDay())} ${at.getDate()} ${monthName(at.getMonth())}${year} · ${clock}`;
}

/**
 * "in 6 days" / "in 3h" / "in 25 min" / "Started".
 *
 * The long form from formatTimeUntil ("2 days and 3h left till start") is right
 * for a detail screen but wraps onto two lines in a card corner, so this is the
 * badge-sized version of the same idea.
 */
export function formatRelative(timeStr) {
  const at = parseTime(timeStr);
  if (!at) return "";

  const diffMs = at.getTime() - Date.now();
  if (diffMs <= 0) return t("time.started");

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return t("time.inMinutes", { count: Math.max(1, minutes) });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.inHours", { count: hours });

  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.inDays", { count: days });

  const weeks = Math.floor(days / 7);
  if (days < 30) return t("time.inWeeks", { count: weeks });

  const months = Math.floor(days / 30);
  return t("time.inMonths", { count: months });
}

/**
 * The mirror of formatRelative, for things that already happened —
 * "just now", "5 min ago", "3h ago". Used by the meeting discussion.
 *
 * parseTime handles the ISO-8601 timestamps the comments API sends as well as
 * the "YYYY-MM-DD HH:MM" meeting times, since replacing a space that isn't
 * there leaves an ISO string untouched.
 */
export function formatAgo(timeStr) {
  const at = parseTime(timeStr);
  if (!at) return "";

  const diffMs = Date.now() - at.getTime();
  // A phone whose clock runs behind the server's would otherwise render a
  // just-posted comment as a negative age. "just now" is the honest answer.
  if (diffMs < 60000) return t("time.justNow");

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });

  const days = Math.floor(hours / 24);
  if (days < 7) return t("time.daysAgo", { count: days });

  const weeks = Math.floor(days / 7);
  if (days < 30) return t("time.weeksAgo", { count: weeks });

  const months = Math.floor(days / 30);
  return t("time.monthsAgo", { count: months });
}
