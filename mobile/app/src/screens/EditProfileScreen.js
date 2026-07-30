import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";
import { FONTS } from "../styles/fonts";
import Appear from "../components/Appear";

// Falls back only if the profile request fails; normally the server sends the
// same list the web's edit page offers, so the two can't drift apart.
const FALLBACK_EMOJIS = ["😀", "😎", "🤓", "🥳", "🌟", "🔥", "🌊", "🍕", "☕", "📚", "🎬", "🐱", "🐶", "🌸", "🚀"];

/** What the server will actually store, so the form can compare like for like. */
function normalise({ displayName, bio, emoji }) {
  return { display_name: displayName.trim(), bio: bio.trim(), avatar_emoji: emoji };
}

export default function EditProfileScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { profile, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [emoji, setEmoji] = useState("");
  const [loading, setLoading] = useState(!profile);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);   // { kind: "ok" | "bad", text }
  const [copied, setCopied] = useState(false);

  // What was on the server when the form was seeded. Everything about the
  // dirty state is measured against this rather than against `profile`, which
  // refreshes underneath us after a save.
  const [saved, setSaved] = useState(null);
  // Set while navigating away deliberately, so the unsaved-changes guard does
  // not fire on the goBack() that follows a successful save.
  const leaving = useRef(false);

  const choices = profile?.emoji_choices?.length ? profile.emoji_choices : FALLBACK_EMOJIS;
  const maxName = profile?.max_display_name || 32;
  const maxBio = profile?.max_bio || 160;

  /**
   * Seed the form once the profile is in hand — editing starts from what is
   * saved, not from blank fields that would wipe them on save.
   *
   * Strictly once, hence the ref: `profile` is shared context and anything
   * else calling refreshProfile() re-runs this effect. Without the guard, a
   * background refresh would overwrite whatever the user was halfway through
   * typing.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (!profile || seeded.current) return;
    seeded.current = true;
    const next = {
      displayName: profile.display_name || "",
      bio: profile.bio || "",
      emoji: profile.avatar_emoji || "",
    };
    setDisplayName(next.displayName);
    setBio(next.bio);
    setEmoji(next.emoji);
    setSaved(normalise(next));
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (!profile) refreshProfile().finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const current = normalise({ displayName, bio, emoji });
  const dirty = !!saved && (
    current.display_name !== saved.display_name
    || current.bio !== saved.bio
    || current.avatar_emoji !== saved.avatar_emoji
  );

  const handleSave = useCallback(async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setNotice(null);
    try {
      // Trimmed on the way out, matching what update_profile() stores — so the
      // form does not sit there looking dirty because of a trailing space.
      await api.updateProfile(current);
      await refreshProfile();
      setSaved(current);
      setNotice({ kind: "ok", text: "Saved." });
      leaving.current = true;
      // Let the confirmation land before the screen disappears.
      setTimeout(() => navigation.goBack(), 700);
    } catch (e) {
      setNotice({ kind: "bad", text: e.message || "Couldn't save. Try again." });
    } finally {
      setSaving(false);
    }
  }, [saving, dirty, current, refreshProfile, navigation]);

  /**
   * Leaving with unsaved edits asks first.
   *
   * This screen is reached from a drawer that is one tap from anywhere, so
   * backing out by accident is easy and used to discard the lot silently.
   */
  useEffect(() => {
    const sub = navigation.addListener("beforeRemove", (event) => {
      if (!dirty || leaving.current || saving) return;
      event.preventDefault();
      Alert.alert(
        "Discard changes?",
        "You've edited your profile but haven't saved.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              leaving.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ]
      );
    });
    return sub;
  }, [navigation, dirty, saving]);

  const handleRevert = useCallback(() => {
    if (!saved) return;
    setDisplayName(saved.display_name);
    setBio(saved.bio);
    setEmoji(saved.avatar_emoji);
    setNotice(null);
  }, [saved]);

  /**
   * Your ID is how people find you in Find People, so make it copyable.
   *
   * The result is reported either way. An earlier version awaited the write
   * and only then showed the tick, so when the clipboard module was missing
   * the promise rejected and the button did nothing at all — no tick, no
   * error, just a tap that appeared to be ignored.
   */
  const handleCopyUid = useCallback(async () => {
    if (!profile?.uid) return;
    try {
      await Clipboard.setStringAsync(String(profile.uid));
      setCopied("ok");
    } catch (e) {
      setCopied("fail");
    }
    setTimeout(() => setCopied(null), 1800);
  }, [profile]);

  const handleSurprise = useCallback(() => {
    if (!choices.length) return;
    // Never hand back the emoji already showing — "surprise" that changes
    // nothing reads as a broken button.
    const pool = choices.filter((c) => c !== emoji);
    setEmoji(pool[Math.floor(Math.random() * pool.length)] || choices[0]);
  }, [choices, emoji]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const initials = (displayName || profile?.username || profile?.uid || "?").slice(0, 2).toUpperCase();

  // Counters warn before they bite, rather than the text simply stopping.
  const nameTone = displayName.length >= maxName ? "bad" : displayName.length > maxName * 0.85 ? "warn" : null;
  const bioTone = bio.length >= maxBio ? "bad" : bio.length > maxBio * 0.85 ? "warn" : null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.preview}>
          <View style={[styles.avatar, { backgroundColor: profile?.profile_color || theme.accent }]}>
            <Text style={emoji ? styles.avatarEmoji : styles.avatarText}>{emoji || initials}</Text>
          </View>
          <Text style={styles.previewName}>{displayName.trim() || profile?.username || "Your name"}</Text>
          <Text style={styles.previewUid}>@{profile?.uid}</Text>
          <Text style={styles.previewBio}>{bio.trim() || "No bio yet."}</Text>
          {dirty ? (
            <Appear offset={6} duration={200}>
              <Text style={styles.unsaved}>Unsaved changes</Text>
            </Appear>
          ) : null}
        </View>

        {notice ? (
          <Appear offset={-6} duration={220}>
            <View style={[styles.notice, notice.kind === "bad" && styles.noticeBad]}>
              <Text style={[styles.noticeText, notice.kind === "bad" && styles.noticeTextBad]}>
                {notice.kind === "bad" ? "⚠️  " : "✅  "}{notice.text}
              </Text>
            </View>
          </Appear>
        ) : null}

        <View style={styles.card}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Display name</Text>
            <Text style={[styles.counter, nameTone === "warn" && styles.counterWarn, nameTone === "bad" && styles.counterBad]}>
              {displayName.length}/{maxName}
            </Text>
          </View>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={maxName}
            placeholder={profile?.username || "How you want to be seen"}
            placeholderTextColor={theme.text3}
            returnKeyType="next"
          />
          <Text style={styles.hint}>Leave empty to go back to {profile?.username}.</Text>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Bio</Text>
            <Text style={[styles.counter, bioTone === "warn" && styles.counterWarn, bioTone === "bad" && styles.counterBad]}>
              {bio.length}/{maxBio}
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={bio}
            onChangeText={setBio}
            maxLength={maxBio}
            multiline
            textAlignVertical="top"
            placeholder="A sentence about you — what you like organising or joining."
            placeholderTextColor={theme.text3}
          />
          <Text style={styles.hint}>People see this when they open your profile.</Text>

          <View style={styles.labelRow}>
            <Text style={styles.label}>Avatar emoji</Text>
            <Pressable onPress={handleSurprise} hitSlop={8}>
              <Text style={styles.surprise}>🎲  Surprise me</Text>
            </Pressable>
          </View>
          <View style={styles.emojiWrap}>
            <Pressable
              style={[styles.emojiBtn, !emoji && styles.emojiBtnActive]}
              onPress={() => setEmoji("")}
            >
              <Text style={styles.emojiNone}>{initials}</Text>
            </Pressable>
            {choices.map((option) => (
              <Pressable
                key={option}
                style={[styles.emojiBtn, emoji === option && styles.emojiBtnActive]}
                onPress={() => setEmoji(option)}
              >
                <Text style={{ fontSize: 20 }}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* What the server will not let anyone change — shown rather than
            omitted, so it is clear these are fixed rather than missing. The
            web prints the same pair with a "Locked" badge. */}
        <View style={[styles.card, styles.lockedCard]}>
          <Text style={[styles.label, styles.labelFirst]}>Account</Text>

          <View style={styles.readonlyRow}>
            <View style={styles.readonlyBody}>
              <Text style={styles.readonlyLabel}>Email</Text>
              <Text style={styles.readonlyValue} numberOfLines={1}>{profile?.email}</Text>
            </View>
            <Text style={styles.lockBadge}>🔒 Locked</Text>
          </View>

          <Pressable style={styles.readonlyRow} onPress={handleCopyUid}>
            <View style={styles.readonlyBody}>
              <Text style={styles.readonlyLabel}>User ID</Text>
              <Text style={styles.readonlyValue}>@{profile?.uid}</Text>
            </View>
            <Text
              style={[
                styles.copyBadge,
                copied === "ok" && styles.copyBadgeDone,
                copied === "fail" && styles.copyBadgeFail,
              ]}
            >
              {copied === "ok" ? "✓ Copied" : copied === "fail" ? "Can't copy" : "Copy"}
            </Text>
          </Pressable>
          <Text style={styles.hint}>Share your ID so people can find you in Find People.</Text>
        </View>

        <View style={styles.actions}>
          {dirty ? (
            <Pressable style={styles.revertBtn} onPress={handleRevert} disabled={saving}>
              <Text style={styles.revertText}>Revert</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.saveBtn, (saving || !dirty) && styles.saveBtnInert]}
            onPress={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? (
              <ActivityIndicator color={theme.accentOn} />
            ) : (
              <Text style={[styles.saveText, !dirty && styles.saveTextInert]}>
                {dirty ? "Save changes" : "No changes"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (t) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: t.bg },
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },

  preview: { alignItems: "center", paddingVertical: 18 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", ...SHADOW.s2 },
  avatarText: { color: "#fff", fontFamily: FONTS.heading, fontSize: 24 },
  avatarEmoji: { fontSize: 36 },
  previewName: { marginTop: 10, fontSize: 18, fontFamily: FONTS.heading, color: t.text },
  previewUid: { fontSize: 12, color: t.text3, marginTop: 2 },
  previewBio: { marginTop: 6, fontSize: 13, color: t.text3, textAlign: "center", paddingHorizontal: 24 },
  unsaved: {
    marginTop: 10,
    fontSize: 11,
    fontFamily: FONTS.accent,
    color: t.status.warn,
    backgroundColor: t.status.warnSoft,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: "hidden",
  },

  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
    ...SHADOW.s1,
  },
  lockedCard: { marginTop: 14 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: {
    fontSize: 11,
    fontFamily: FONTS.bodySemi,
    color: t.text3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 7,
  },
  labelFirst: { marginTop: 0 },
  counter: { fontSize: 11, color: t.text3, marginTop: 7, fontFamily: FONTS.accentMedium },
  counterWarn: { color: t.status.warn },
  counterBad: { color: t.status.bad },
  surprise: { fontSize: 11.5, color: t.accentStrong, fontFamily: FONTS.bodySemi, marginTop: 7 },
  input: {
    backgroundColor: t.surface2,
    borderRadius: RADIUS.base,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: t.text,
  },
  textarea: { height: 92 },
  hint: { fontSize: 11.5, color: t.text3, marginTop: 6 },

  emojiWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emojiBtn: {
    width: 46,
    height: 46,
    borderRadius: RADIUS.base,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.surface2,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  emojiBtnActive: { borderColor: t.accent, backgroundColor: t.accentSoft },
  emojiNone: { fontSize: 13, fontFamily: FONTS.accent, color: t.text2 },

  readonlyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.surface2,
    borderRadius: RADIUS.base,
    borderWidth: 1,
    borderColor: t.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
  },
  readonlyBody: { flex: 1, marginRight: 10 },
  readonlyLabel: { fontSize: 10.5, color: t.text3, fontFamily: FONTS.bodySemi, textTransform: "uppercase", letterSpacing: 0.4 },
  readonlyValue: { fontSize: 14, color: t.text2, marginTop: 2 },
  lockBadge: { fontSize: 11, color: t.text3, fontFamily: FONTS.bodySemi },
  copyBadge: {
    fontSize: 11,
    fontFamily: FONTS.accent,
    color: t.accentStrong,
    backgroundColor: t.accentSoft,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  copyBadgeDone: { color: t.status.good, backgroundColor: t.status.goodSoft },
  copyBadgeFail: { color: t.status.bad, backgroundColor: t.status.badSoft },

  notice: {
    marginBottom: 14,
    padding: 13,
    borderRadius: RADIUS.base,
    backgroundColor: t.accentSoft,
    borderWidth: 1,
    borderColor: t.accent,
  },
  noticeBad: { backgroundColor: t.surface, borderColor: t.status.bad },
  noticeText: { fontSize: 13.5, color: t.accentStrong, fontFamily: FONTS.bodySemi },
  noticeTextBad: { color: t.status.bad },

  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  revertBtn: {
    borderRadius: RADIUS.base,
    paddingVertical: 16,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  revertText: { fontFamily: FONTS.accentMedium, fontSize: 14, color: t.text2 },
  saveBtn: {
    flex: 1,
    borderRadius: RADIUS.base,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.accent,
    ...SHADOW.s2,
  },
  // Greyed rather than hidden: the button staying put is what makes "nothing
  // to save" readable, instead of the row shifting every time a field changes.
  saveBtnInert: { backgroundColor: t.surface3, shadowOpacity: 0, elevation: 0 },
  saveText: { fontFamily: FONTS.accent, fontSize: 16, color: t.accentOn },
  // White on the grey disabled fill is unreadable — the label has to dim too.
  saveTextInert: { color: t.text3 },
});
