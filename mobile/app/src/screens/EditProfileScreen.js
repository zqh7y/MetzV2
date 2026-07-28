import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator,
} from "react-native";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";
import { FONTS } from "../styles/fonts";

// Falls back only if the profile request fails; normally the server sends the
// same list the web's edit page offers, so the two can't drift apart.
const FALLBACK_EMOJIS = ["😀", "😎", "🤓", "🥳", "🌟", "🔥", "🌊", "🍕", "☕", "📚", "🎬", "🐱", "🐶", "🌸", "🚀"];

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

  const choices = profile?.emoji_choices?.length ? profile.emoji_choices : FALLBACK_EMOJIS;
  const maxName = profile?.max_display_name || 32;
  const maxBio = profile?.max_bio || 160;

  // Seed the form once the profile is in hand — editing starts from what is
  // saved, not from blank fields that would wipe the fields on save.
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name || "");
    setBio(profile.bio || "");
    setEmoji(profile.avatar_emoji || "");
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (!profile) refreshProfile().finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      await api.updateProfile({ display_name: displayName, bio, avatar_emoji: emoji });
      await refreshProfile();
      setNotice({ kind: "ok", text: "Saved." });
      // Let the confirmation land before the screen disappears.
      setTimeout(() => navigation.goBack(), 700);
    } catch (e) {
      setNotice({ kind: "bad", text: e.message || "Couldn't save. Try again." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const initials = (displayName || profile?.username || profile?.uid || "?").slice(0, 2).toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View style={styles.preview}>
        <View style={[styles.avatar, { backgroundColor: profile?.profile_color || theme.accent }]}>
          <Text style={emoji ? styles.avatarEmoji : styles.avatarText}>{emoji || initials}</Text>
        </View>
        <Text style={styles.previewName}>{displayName || profile?.username || "Your name"}</Text>
        <Text style={styles.previewBio}>{bio || "No bio yet."}</Text>
      </View>

      {notice ? (
        <View style={[styles.notice, notice.kind === "bad" && styles.noticeBad]}>
          <Text style={[styles.noticeText, notice.kind === "bad" && styles.noticeTextBad]}>
            {notice.kind === "bad" ? "⚠️  " : "✅  "}{notice.text}
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>Display name</Text>
          <Text style={styles.counter}>{displayName.length}/{maxName}</Text>
        </View>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={maxName}
          placeholder={profile?.username || "How you want to be seen"}
          placeholderTextColor={theme.text3}
        />
        <Text style={styles.hint}>Leave empty to go back to {profile?.username}.</Text>

        <View style={styles.labelRow}>
          <Text style={styles.label}>Bio</Text>
          <Text style={styles.counter}>{bio.length}/{maxBio}</Text>
        </View>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={bio}
          onChangeText={setBio}
          maxLength={maxBio}
          multiline
          textAlignVertical="top"
          placeholder="A line about you"
          placeholderTextColor={theme.text3}
        />

        <Text style={styles.label}>Avatar emoji</Text>
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

      <Pressable style={[styles.saveBtn, saving && styles.saveBtnBusy]} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={theme.accentOn} />
        ) : (
          <Text style={styles.saveText}>Save changes</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },

  preview: { alignItems: "center", paddingVertical: 18 },
  avatar: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", ...SHADOW.s2 },
  avatarText: { color: "#fff", fontFamily: FONTS.heading, fontSize: 24 },
  avatarEmoji: { fontSize: 36 },
  previewName: { marginTop: 10, fontSize: 18, fontFamily: FONTS.heading, color: t.text },
  previewBio: { marginTop: 4, fontSize: 13, color: t.text3, textAlign: "center", paddingHorizontal: 24 },

  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
    ...SHADOW.s1,
  },
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
  counter: { fontSize: 11, color: t.text3, marginTop: 7, fontFamily: FONTS.accentMedium },
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

  saveBtn: {
    marginTop: 16,
    borderRadius: RADIUS.base,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: t.accent,
    ...SHADOW.s2,
  },
  saveBtnBusy: { opacity: 0.75 },
  saveText: { fontFamily: FONTS.accent, fontSize: 16, color: t.accentOn },
});
