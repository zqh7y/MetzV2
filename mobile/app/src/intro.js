import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The answers the intro collects before an account exists.
 *
 * On the device rather than on the account, because at this point there is no
 * account to put them on — the whole point of the intro is that it runs before
 * sign-up. WelcomeScreen sends the role up once there is somewhere to send it,
 * after which the account is the source of truth and this copy is only a
 * hand-off.
 *
 * "Seen" is per install, not per account: it explains what the app is, and a
 * second person signing in on the same phone does not need that explained
 * again — they were presumably shown it by the first.
 */
const SEEN = "intro:seen";
const ROLE = "intro:role";

export async function hasSeenIntro() {
  try {
    return (await AsyncStorage.getItem(SEEN)) === "1";
  } catch {
    // Unreadable storage means we cannot prove it was seen. Showing it again
    // is a mild annoyance; skipping it for a genuinely new user is worse.
    return false;
  }
}

export async function markIntroSeen() {
  try {
    await AsyncStorage.setItem(SEEN, "1");
  } catch {
    // Ignored: failing to record it costs one repeat of the intro, which is
    // not worth blocking sign-up over.
  }
}

export async function getIntroRole() {
  try {
    return await AsyncStorage.getItem(ROLE);
  } catch {
    return null;
  }
}

export async function setIntroRole(role) {
  try {
    if (role) await AsyncStorage.setItem(ROLE, role);
  } catch {
    // Ignored for the same reason: the account defaults to "member" and
    // Settings can change it.
  }
}

/** Cleared once the answer has reached the account it belongs to. */
export async function clearIntroRole() {
  try {
    await AsyncStorage.removeItem(ROLE);
  } catch {
    // Ignored — a stale value is only ever re-sent as the same answer.
  }
}
