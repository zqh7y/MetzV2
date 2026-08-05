import React, { useMemo } from "react";
import { Modal, View, Text, StyleSheet, Pressable, Alert } from "react-native";

import { useAuth } from "../context/AuthContext";
import { canSwitchTo } from "../accounts";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { RADIUS, SHADOW } from "../styles/theme";

/**
 * What happens when you tap "Log out".
 *
 * Tapping it used to sign you straight out, with no confirmation and no other
 * option — so switching to another account meant logging out, landing on
 * Login, and creating one meant finding Signup from there. Both are the same
 * two taps as logging out, and neither was offered.
 *
 * The account you are currently signed in as is shown at the top, because all
 * three choices are about leaving it and it should be obvious which one that
 * is on a shared phone.
 */
export default function AccountSheet({ visible, onClose }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { profile, uid, signOut, accounts, switchTo, forget } = useAuth();

  const name = profile?.display_name || profile?.username || profile?.uid || "";
  const initials = (name || "?").slice(0, 2).toUpperCase();

  // Everyone else this device has signed in as. Expired ones still appear —
  // hiding them would look like the account had been forgotten, when all that
  // is needed is the password again.
  //
  // Matched on email as well as uid, and de-duplicated: the same person can end
  // up stored twice if an earlier sign-in recorded them before the profile
  // arrived, and offering someone the chance to "switch" to the account they
  // are already using is nonsense.
  const others = useMemo(() => {
    const seen = new Set();
    const mine = (profile?.email || "").toLowerCase();
    return accounts.filter((a) => {
      if (!a?.uid || a.uid === uid) return false;
      if (mine && (a.email || "").toLowerCase() === mine) return false;
      if (seen.has(a.uid)) return false;
      seen.add(a.uid);
      return true;
    });
  }, [accounts, uid, profile]);

  /** Switching keeps this account's token; logging out drops it. */
  function choose(next, keepSession) {
    onClose?.();
    // Let the sheet finish closing before the navigator swaps stacks, or the
    // dismiss animation plays over a screen that no longer exists.
    setTimeout(() => signOut({ next, keepSession }), 180);
  }

  function useAccount(account) {
    onClose?.();
    setTimeout(() => {
      // switchTo refuses an expired token rather than signing in to a session
      // every request would reject; falling back to Login is the honest answer.
      if (!switchTo(account)) signOut({ next: "Login", keepSession: true });
    }, 180);
  }

  function handleForget(account) {
    Alert.alert(
      "Remove this account?",
      `${account.name || account.email || account.uid} will stop appearing here. Nothing is deleted — you can sign in again any time.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => forget(account.uid) },
      ]
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stops a tap inside the sheet closing it on the way through. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grabber} />

          <View style={styles.who}>
            <View style={[styles.avatar, { backgroundColor: profile?.profile_color || theme.accent }]}>
              <Text style={profile?.avatar_emoji ? styles.avatarEmoji : styles.avatarText}>
                {profile?.avatar_emoji || initials}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.whoName} numberOfLines={1}>{name}</Text>
              {profile?.email ? (
                <Text style={styles.whoEmail} numberOfLines={1}>{profile.email}</Text>
              ) : null}
            </View>
          </View>

          {/* Accounts already signed in on this phone: one tap, no password. */}
          {others.length ? (
            <View style={styles.saved}>
              <Text style={styles.savedLabel}>SWITCH TO</Text>
              {others.map((account) => {
                const ready = canSwitchTo(account);
                const label = account.name || account.email || account.uid;
                return (
                  <Pressable
                    key={account.uid}
                    style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                    onPress={() => useAccount(account)}
                    onLongPress={() => handleForget(account)}
                  >
                    <View style={[styles.savedAvatar, { backgroundColor: account.color || theme.accent }]}>
                      <Text style={account.emoji ? styles.avatarEmoji : styles.savedAvatarText}>
                        {account.emoji || (label || "?").slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle} numberOfLines={1}>{label}</Text>
                      <Text style={styles.optionBody} numberOfLines={1}>
                        {ready
                          ? (account.email || `@${account.uid}`)
                          : "Signed out — needs your password"}
                      </Text>
                    </View>
                    {!ready ? <Text style={styles.savedStale}>↻</Text> : null}
                  </Pressable>
                );
              })}
              <Text style={styles.savedHint}>Press and hold an account to remove it.</Text>
            </View>
          ) : null}

          <Option
            styles={styles}
            icon="⇄"
            title={others.length ? "Use another account" : "Switch account"}
            body="Sign out and log in as someone else."
            onPress={() => choose("Login", true)}
          />
          <Option
            styles={styles}
            icon="＋"
            title="Create a new account"
            body="Sign out and go straight to sign-up."
            onPress={() => choose("Signup", true)}
          />
          <Option
            styles={styles}
            // Not ⏻ (U+23FB): Android's default font has no glyph for it and
            // it rendered as a tofu box next to two icons that were fine.
            icon="🚪"
            title="Log out"
            body="Just sign out of this account."
            tone="bad"
            onPress={() => choose(null, false)}
          />

          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Option({ styles, icon, title, body, tone, onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
      onPress={onPress}
    >
      <View style={[styles.optionIcon, tone === "bad" && styles.optionIconBad]}>
        <Text style={[styles.optionIconText, tone === "bad" && styles.optionIconTextBad]}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, tone === "bad" && styles.optionTitleBad]}>{title}</Text>
        <Text style={styles.optionBody}>{body}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (t) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(12,16,28,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: t.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 26,
    ...SHADOW.s2,
  },
  grabber: {
    alignSelf: "center", width: 38, height: 4, borderRadius: 2,
    backgroundColor: t.border, marginBottom: 14,
  },

  who: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingBottom: 14, marginBottom: 6,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: FONTS.heading, fontSize: 15 },
  avatarEmoji: { fontSize: 22 },
  whoName: { fontSize: 15, fontFamily: FONTS.headingSemi, color: t.text },
  whoEmail: { fontSize: 12.5, color: t.text3, marginTop: 1 },

  saved: { paddingTop: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: t.border, marginBottom: 4 },
  savedLabel: { fontSize: 10.5, fontFamily: FONTS.bodySemi, color: t.text3, letterSpacing: 0.6, marginTop: 4 },
  savedAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  savedAvatarText: { color: "#fff", fontFamily: FONTS.heading, fontSize: 13 },
  savedStale: { fontSize: 16, color: t.text3, paddingHorizontal: 4 },
  savedHint: { fontSize: 11, color: t.text3, marginBottom: 8, marginTop: 2 },

  option: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  optionPressed: { opacity: 0.6 },
  optionIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center", backgroundColor: t.accentSoft,
  },
  optionIconBad: { backgroundColor: t.status.badSoft },
  optionIconText: { fontSize: 17, color: t.accentStrong },
  optionIconTextBad: { color: t.status.bad },
  optionTitle: { fontSize: 14.5, fontFamily: FONTS.headingSemi, color: t.text },
  optionTitleBad: { color: t.status.bad },
  optionBody: { fontSize: 12.5, color: t.text3, marginTop: 1 },

  cancel: {
    marginTop: 10, paddingVertical: 13, borderRadius: RADIUS.base,
    backgroundColor: t.surface2, alignItems: "center",
  },
  cancelText: { fontSize: 14, fontFamily: FONTS.headingSemi, color: t.text2 },
});
