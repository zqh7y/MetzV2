import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The accounts this device has signed into, so switching between them does not
 * mean typing a password every time.
 *
 * Each entry keeps the session token the API issued, which is what makes a
 * switch instant. That is the same token the app already stores for whoever is
 * signed in right now — this holds several instead of one, on the same device,
 * so it is not a new kind of secret being kept. Logging out (as opposed to
 * switching) drops that account's token, because "log out" should mean the
 * next person cannot get back in with one tap.
 *
 * Entry: { uid, email, name, emoji, color, token, lastUsed }
 */
const KEY = "known_accounts";
const MAX_ACCOUNTS = 6;

/**
 * When a token stops being accepted, read from the token itself.
 *
 * issue_token() signs "uid|expiry" and base64s it, so the expiry is plainly
 * readable without the secret — the signature is what cannot be forged, not
 * the contents. Reading it lets a stale account be shown as needing a password
 * again, rather than being offered as a one-tap switch that lands the whole
 * app in 401s.
 */
export function tokenExpiresAt(token) {
  if (!token || !token.includes(".")) return null;
  try {
    const encoded = token.slice(0, token.lastIndexOf("."));
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/")
      + "=".repeat((4 - (encoded.length % 4)) % 4);
    const payload = global.atob ? global.atob(padded) : Buffer.from(padded, "base64").toString("binary");
    const expires = Number(payload.slice(payload.lastIndexOf("|") + 1));
    return Number.isFinite(expires) ? expires * 1000 : null;
  } catch (e) {
    return null;
  }
}

/** A saved account can only be switched to instantly if its token still works. */
export function canSwitchTo(account) {
  if (!account?.token) return false;
  const expires = tokenExpiresAt(account.token);
  // An unreadable expiry is treated as usable: the server is the authority,
  // and refusing on a parse failure would lock someone out of their own
  // account over a formatting change.
  return expires === null || expires > Date.now();
}

async function readAll() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

async function writeAll(list) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ACCOUNTS)));
  } catch (e) {
    // Losing the switch list is a inconvenience, not a failure worth surfacing
    // in the middle of signing in.
  }
}

/** Most recently used first — the one you want next is usually the last one. */
export async function listAccounts() {
  const list = await readAll();
  return list.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
}

/**
 * Record (or update) an account. Merges rather than replaces, so a call that
 * only knows the uid and token does not wipe the name shown next to it.
 */
export async function rememberAccount(entry) {
  if (!entry?.uid) return;
  const list = await readAll();
  const existing = list.find((a) => a.uid === entry.uid) || {};
  const merged = { ...existing, ...entry, lastUsed: Date.now() };
  await writeAll([merged, ...list.filter((a) => a.uid !== entry.uid)]);
}

/** Drop the stored token but keep the account listed, so it can be signed into. */
export async function clearAccountToken(uid) {
  const list = await readAll();
  await writeAll(list.map((a) => (a.uid === uid ? { ...a, token: null } : a)));
}

/** Remove an account from the switcher entirely. */
export async function forgetAccount(uid) {
  const list = await readAll();
  await writeAll(list.filter((a) => a.uid !== uid));
}
