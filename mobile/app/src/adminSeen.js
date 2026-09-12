import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * What the admin has already looked at in each moderation queue.
 *
 * The red marker used to follow `pending_review_count` and `open_report_count`,
 * which count outstanding work rather than unseen work. Those only reach zero
 * once every report is actioned and every meeting approved, so for an admin who
 * had read the queue and left it alone the marker stayed red permanently and
 * stopped carrying any information at all.
 *
 * Storing the highest id seen — rather than the count at the time — is what
 * makes it correct across changes to the queue. With counts, approving one
 * meeting and someone posting another leaves the total unchanged, and the new
 * one would never light the marker.
 *
 * Kept per account: two admins sharing a phone through the account switcher
 * should not mark each other's queues as read.
 */
const KEY = (uid, section) => `adminSeen:${uid}:${section}`;

export async function getSeenId(uid, section) {
  if (!uid) return 0;
  try {
    const raw = await AsyncStorage.getItem(KEY(uid, section));
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    // A badge is not worth failing a screen over: treat unreadable storage as
    // "nothing seen", which shows the marker rather than hiding real work.
    return 0;
  }
}

/**
 * Record that everything up to `id` has been shown. Never moves backwards, so
 * opening an older filtered view cannot un-see newer items.
 */
export async function markSeen(uid, section, id) {
  if (!uid || !id) return;
  try {
    const current = await getSeenId(uid, section);
    if (id > current) await AsyncStorage.setItem(KEY(uid, section), String(id));
  } catch {
    // Ignored for the same reason as above.
  }
}
