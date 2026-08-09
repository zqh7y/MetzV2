/**
 * Fixed vocabularies the server sends as English words.
 *
 * Meeting tags are stored on the meeting as the word itself ("Sports"), and
 * report reasons arrive from /api/report-reasons as {id, label}. Neither is
 * free text — both are closed sets defined in utils/models.py and data.py — so
 * the app can translate them by key on the way to the screen without the
 * backend having to change or old rows having to be migrated.
 *
 * Both helpers fall back to what the server sent. If someone adds an eleventh
 * tag next year, it shows up in English rather than as a raw "tag.Whatever".
 */

/** "Sports" -> "ספורט". Unknown tags pass through unchanged. */
export function localizedTag(t, tag) {
  if (!tag) return "";
  const key = `tag.${tag}`;
  const out = t(key);
  return out === key ? tag : out;
}

/** {id: "spam", label: "Spam or a scam"} -> the translated label. */
export function localizedReportReason(t, reason) {
  if (!reason) return "";
  const key = `reportReason.${reason.id}`;
  const out = t(key);
  return out === key ? (reason.label || reason.id) : out;
}
