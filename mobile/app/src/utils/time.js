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
