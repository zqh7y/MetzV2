import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { RADIUS, SHADOW } from "../styles/theme";
import { FONTS } from "../styles/fonts";
import Appear from "../components/Appear";
import { Alert } from "../components/AppAlert";
import { LinearGradient } from "expo-linear-gradient";
import ProfileAvatar from "../components/ProfileAvatar";
import { BACKGROUNDS, FRAMES, backgroundFor } from "../styles/profileLooks";

// Falls back only if the profile request fails; normally the server sends the
// same list the web's edit page offers, so the two can't drift apart.
const FALLBACK_EMOJIS = ["😀", "😎", "🤓", "🥳", "🌟", "🔥", "🌊", "🍕", "☕", "📚", "🎬", "🐱", "🐶", "🌸", "🚀"];

/** What the server will actually store, so the form can compare like for like. */
function normalise({ displayName, bio, emoji, frame, background, interests }) {
  return {
    display_name: displayName.trim(), bio: bio.trim(), avatar_emoji: emoji,
    profile_frame: frame, profile_background: background,
    // Compared as a string: two arrays with the same tags are never `!==`
    // equal, so the form would have thought it was dirty from the moment
    // it loaded and offered to discard changes nobody made.
    interests: [...interests].sort().join(","),
  };
}

/**
 * The profile form.
 *
 * No longer a route: it was its own drawer entry sitting directly beneath "My
 * profile", which is two menu rows for one subject. ProfileScreen owns it now
 * and shows it *instead of* the profile, not inside it. An earlier attempt
 * rendered it as a section in the middle of the page, which put a second
 * avatar under the first and left the stats, tiers and meeting list sitting
 * below the fields — a page you had to scroll past your own profile to finish
 * filling in. Editing is a mode, so it gets the screen.
 *
 * That means the layout is unchanged from when this was a route: its own
 * scroller, its own keyboard handling, its own pinned footer.
 *
 * `onDone` is the only difference, and its presence is what "hosted" means
 * here: with it, saving and cancelling hand control back to Profile instead of
 * popping a screen, and the footer grows a Cancel button, since the header's
 * back chevron now belongs to Profile rather than to the form. Being hosted
 * also means Profile, not this, owns what the back gesture does — hence
 * `onDirtyChange` rather than a `beforeRemove` listener of its own; two
 * listeners on one event would prompt twice.
 */
export default function EditProfileScreen({ navigation, onDone, onDirtyChange }) {
  const hosted = typeof onDone === "function";
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [emoji, setEmoji] = useState("");
  const [frame, setFrame] = useState("none");
  const [background, setBackground] = useState("default");
  const [interests, setInterests] = useState([]);
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
      frame: profile.profile_frame || "none",
      background: profile.profile_background || "default",
      interests: profile.interests || [],
    };
    setDisplayName(next.displayName);
    setBio(next.bio);
    setEmoji(next.emoji);
    setFrame(next.frame);
    setBackground(next.background);
    setInterests(next.interests);
    setSaved(normalise(next));
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    if (!profile) refreshProfile().finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const current = normalise({ displayName, bio, emoji, frame, background, interests });
  const dirty = !!saved && (
    current.display_name !== saved.display_name
    || current.bio !== saved.bio
    || current.avatar_emoji !== saved.avatar_emoji
    || current.profile_frame !== saved.profile_frame
    || current.profile_background !== saved.profile_background
    || current.interests !== saved.interests
  );

  const handleSave = useCallback(async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setNotice(null);
    try {
      // Trimmed on the way out, matching what update_profile() stores — so the
      // form does not sit there looking dirty because of a trailing space.
      await api.updateProfile({ ...current, interests });
      await refreshProfile();
      setSaved(current);
      setNotice({ kind: "ok", text: "Saved." });
      leaving.current = true;
      // Let the confirmation land before the form goes away. Hosted there is
      // no screen to pop — Profile drops back to showing the profile.
      setTimeout(() => (hosted ? onDone() : navigation.goBack()), 700);
    } catch (e) {
      setNotice({ kind: "bad", text: e.message || "Couldn't save. Try again." });
    } finally {
      setSaving(false);
    }
  }, [saving, dirty, current, refreshProfile, navigation, hosted, onDone]);

  /** Cancel: hand back to the host, asking first if there is anything to lose. */
  const handleClose = useCallback(() => {
    if (!dirty) { onDone?.(); return; }
    Alert.alert(
      "Discard changes?",
      "You've edited your profile but haven't saved.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => onDone?.() },
      ]
    );
  }, [dirty, onDone]);

  // Hosted, the back gesture is Profile's to answer — it has to decide between
  // closing the form and leaving the screen, which only it can know. Telling it
  // whether there is anything to lose is this form's whole part in that.
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  /**
   * Leaving with unsaved edits asks first.
   *
   * Backing out by accident is easy and used to discard the lot silently. Only
   * when this is its own screen: hosted, the listener above hands the question
   * to Profile instead, because two listeners on one `beforeRemove` would put
   * the same prompt up twice.
   */
  useEffect(() => {
    if (hosted) return undefined;
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
  }, [navigation, dirty, saving, hosted]);

  const handleRevert = useCallback(() => {
    if (!saved) return;
    setDisplayName(saved.display_name);
    setBio(saved.bio);
    setEmoji(saved.avatar_emoji);
    setFrame(saved.profile_frame);
    setBackground(saved.profile_background);
    setInterests(saved.interests ? saved.interests.split(",").filter(Boolean) : []);
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

  const fields = (
    <>
        {/* The only preview on screen, hosted or not — the profile hero is not
            behind this any more, it is replaced by it. */}
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

        {/* The same two choices the welcome flow offers, so someone who
            skipped it there is not stuck with the default forever. */}
        <View style={styles.field}>
          <Text style={styles.label}>{t("userProfile.interests")}</Text>
          <View style={styles.lookRow}>
            {INTEREST_TAGS.map((tag) => {
              const on = interests.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() => setInterests((prev) => (
                    prev.includes(tag)
                      ? prev.filter((x) => x !== tag)
                      // Same cap the welcome flow uses, so the two cannot
                      // disagree about how many is too many.
                      : prev.length >= (profile?.max_interests || 5) ? prev : [...prev, tag]
                  ))}
                  style={[styles.tagChip, on && styles.tagChipOn]}
                >
                  <Text style={[styles.tagChipText, on && styles.tagChipTextOn]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("welcome.sectionBackground")}</Text>
          <View style={styles.lookRow}>
            {Object.keys(BACKGROUNDS).map((id) => (
              <Pressable key={id} onPress={() => setBackground(id)} style={styles.lookItem}>
                <LinearGradient
                  colors={backgroundFor(id, theme)}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.lookSwatch, background === id && styles.lookSelected]}
                />
                <Text style={styles.lookLabel}>{t(BACKGROUNDS[id].labelKey)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("welcome.sectionFrame")}</Text>
          <View style={styles.lookRow}>
            {Object.keys(FRAMES).map((id) => (
              <Pressable key={id} onPress={() => setFrame(id)} style={styles.lookItem}>
                <View style={[styles.lookFrame, frame === id && styles.lookSelected]}>
                  <ProfileAvatar size={44} frame={id} emoji={emoji} initials={initials} />
                </View>
                <Text style={styles.lookLabel}>{t(FRAMES[id].labelKey)}</Text>
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
    </>
  );

  // Pinned rather than sitting at the end of the scroll: the form is taller
  // than the screen, so changing the display name at the top used to mean
  // scrolling past the bio, the emoji grid and the ID card to reach Save — and
  // nothing on the way down said whether it had saved.
  //
  // Hosted, the left slot is Cancel: the header chevron leaves Profile
  // altogether, so without this there is no way back to the profile itself.
  // Standalone that chevron is the way out, and the slot goes to Revert.
  const footer = (
    <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.actions}>
        {hosted ? (
          <Pressable style={styles.revertBtn} onPress={handleClose} disabled={saving}>
            <Text style={styles.revertText}>{dirty ? "Cancel" : "Close"}</Text>
          </Pressable>
        ) : dirty ? (
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
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {fields}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  );
}

const INTEREST_TAGS = [
  "Sports", "Food & Drink", "Study", "Music", "Art",
  "Tech", "Outdoors", "Gaming", "Social", "Fitness",
];

const makeStyles = (t) => StyleSheet.create({
  tagChip: {
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999,
    backgroundColor: t.bg, borderWidth: 1, borderColor: t.border,
  },
  tagChipOn: { backgroundColor: t.accentSoft, borderColor: t.accent },
  tagChipText: { fontSize: 13, fontFamily: FONTS.bodySemi, color: t.text2 },
  tagChipTextOn: { color: t.accentStrong },
  lookRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  lookItem: { alignItems: "center", width: 68, gap: 6 },
  lookSwatch: { width: 54, height: 54, borderRadius: 16, borderWidth: 2, borderColor: "transparent" },
  lookFrame: {
    width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center",
    backgroundColor: t.bg, borderWidth: 2, borderColor: "transparent",
  },
  lookSelected: { borderColor: t.accent },
  lookLabel: { fontSize: 10, fontFamily: FONTS.body, color: t.text3, textAlign: "center" },
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
  readonlyBody: { flex: 1, marginEnd: 10 },
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

  actions: { flexDirection: "row", gap: 10 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: t.surface,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
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
