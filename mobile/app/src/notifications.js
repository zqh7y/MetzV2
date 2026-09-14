import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";

import { api } from "./api";

/**
 * Notifications, in two halves that work very differently.
 *
 * **Reminders about meetings you joined are scheduled on the phone.** Nothing
 * is sent from anywhere: when you join, the device is told to raise a
 * notification at a time, and it does, offline, exactly then. The alternative
 * — a server that wakes up daily and pushes — needs a server that is awake,
 * and this one sleeps after fifteen idle minutes on its free plan. A reminder
 * that arrives when the host happens to be up is not a reminder.
 *
 * **Everything else is pushed**, because only the server knows it: somebody
 * commented, somebody joined, a meeting is waiting on review. Those all happen
 * during a request the server is already serving, so there is nothing to
 * schedule — see notify_user() on the API side.
 *
 * Push does not work in Expo Go from SDK 53 on Android. Nothing here throws
 * because of that; registration just finds no token and stops, which leaves
 * local reminders — the half that matters most — working in development.
 */

// Shown even while the app is open. Someone reading a meeting page is exactly
// who wants to know a comment just landed on it.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHANNEL = "default";

/** Android shows nothing without a channel, and silently. */
async function ensureChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: "Metz",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * Ask once, and report whether we may post anything at all.
 *
 * Asked lazily rather than at first launch: a permission prompt before someone
 * has seen what the app is gets refused, and on Android a refusal is close to
 * permanent.
 */
export async function requestPermission() {
  await ensureChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return !!asked.granted;
}

export async function hasPermission() {
  const status = await Notifications.getPermissionsAsync();
  return !!status.granted;
}

/**
 * Hand the server a token it can push to, if this build can have one.
 *
 * Quiet about every reason it might not: a simulator has no push service, Expo
 * Go on Android no longer brokers one, and a refused permission is a choice
 * rather than a fault. None of those are worth an error on a screen.
 */
export async function registerForPush() {
  try {
    if (!Device.isDevice) return null;
    if (!(await requestPermission())) return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId
      || Constants.easConfig?.projectId;
    if (!projectId) return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return null;

    await api.savePushToken(token);
    return token;
  } catch (e) {
    // Expo Go on Android lands here by design. Local reminders are unaffected.
    return null;
  }
}

/** Stop pushing to this device — called when someone signs out. */
export async function unregisterPush() {
  try {
    await api.clearPushToken();
  } catch (e) {
    // Signing out must not depend on the network.
  }
}

// ── Meeting reminders, scheduled on the device ─────────────────────────────

// Keyed by meeting so a reminder can be cancelled when somebody leaves, and so
// joining twice cannot stack two of them.
const MEETING_TAG = "meeting-reminder";

function parseMeetingTime(value) {
  // "YYYY-MM-DD HH:MM", local time, same as everything else in this app.
  if (!value) return null;
  const at = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Two reminders per meeting: the evening before, and an hour ahead.
 *
 * The day-before one is what stops a meeting being forgotten, which is the
 * whole point; the hour-before one is what gets somebody out of the door. Any
 * that would land in the past are skipped rather than fired immediately —
 * joining something starting in ten minutes should not set off a "tomorrow"
 * alert.
 */
export async function scheduleMeetingReminders(meeting) {
  try {
    if (!(await hasPermission())) return;
    await ensureChannel();
    await cancelMeetingReminders(meeting.id);

    const start = parseMeetingTime(meeting.time);
    if (!start) return;

    const title = meeting.title || "Your meeting";
    const when = start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const where = meeting.is_online ? "online" : (meeting.short_location || meeting.location || "");

    const dayBefore = new Date(start.getTime());
    dayBefore.setDate(dayBefore.getDate() - 1);
    dayBefore.setHours(18, 0, 0, 0);

    const hourBefore = new Date(start.getTime() - 60 * 60 * 1000);

    const plan = [
      { at: dayBefore, body: `Tomorrow at ${when}${where ? ` · ${where}` : ""}` },
      { at: hourBefore, body: `Starts in an hour${where ? ` · ${where}` : ""}` },
    ];

    for (const { at, body } of plan) {
      if (at.getTime() <= Date.now()) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { tag: MEETING_TAG, meetingId: meeting.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: at,
          channelId: CHANNEL,
        },
      });
    }
  } catch (e) {
    // A reminder that could not be set is not worth interrupting a join for.
  }
}

/** Drop a meeting's reminders — leaving it, or it being cancelled. */
export async function cancelMeetingReminders(meetingId) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      const data = item.content?.data || {};
      if (data.tag === MEETING_TAG && String(data.meetingId) === String(meetingId)) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
  } catch (e) {
    // Nothing to do about it, and nothing depends on it.
  }
}

/**
 * Re-derive every reminder from what the server says you are going to.
 *
 * The device's schedule is a cache of a fact the server owns, and it drifts:
 * meetings get cancelled, times change, somebody joins on another phone.
 * Rebuilding from the list is cheaper to reason about than trying to patch it
 * event by event, and the list is short.
 */
export async function syncMeetingReminders(meetings) {
  try {
    if (!(await hasPermission())) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled) {
      if ((item.content?.data || {}).tag === MEETING_TAG) {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }
    for (const meeting of meetings || []) {
      await scheduleMeetingReminders(meeting);
    }
  } catch (e) {
    // Same as above: best effort, never in the way.
  }
}
