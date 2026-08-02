// Port of static/time-utils.js. The wording is deliberately identical — a
// meeting that reads "2 days and 3h left till start" on the web should not
// read something else in the app.

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
  if (diffMs <= 0) return "Already started";

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0 && hours === 0) parts.push(`${minutes} min`);

  return `${parts.join(" and ")} left till start`;
}

/** A ticking clock rather than a rounded phrase. */
export function formatCountdown(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
  if (sameDay(at, now)) return `Today · ${clock}`;
  if (sameDay(at, tomorrow)) return `Tomorrow · ${clock}`;

  const year = at.getFullYear() === now.getFullYear() ? "" : ` ${at.getFullYear()}`;
  return `${DAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]}${year} · ${clock}`;
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
  if (diffMs <= 0) return "Started";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `in ${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `in ${days} ${days === 1 ? "day" : "days"}`;

  const weeks = Math.floor(days / 7);
  if (days < 30) return `in ${weeks} ${weeks === 1 ? "week" : "weeks"}`;

  const months = Math.floor(days / 30);
  return `in ${months} ${months === 1 ? "month" : "months"}`;
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
  if (diffMs < 60000) return "just now";

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;

  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? "month" : "months"} ago`;
}
