import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Pressable,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AnimatedBackdrop from "../components/AnimatedBackdrop";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../api";
import { getIntroRole, clearIntroRole } from "../intro";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import ProfileAvatar from "../components/ProfileAvatar";
import FaceAvatar, { FACE_IDS } from "../components/FaceAvatar";
import { BACKGROUNDS, FRAMES, backgroundFor } from "../styles/profileLooks";

/**
 * The one-time welcome, shown only to an account that has just been created.
 *
 * Signing up used to drop you straight onto the map with a blank profile and no
 * idea what the app was for. This asks the two questions worth asking while
 * someone is still willing to answer them, and lets them skip both.
 *
 * The interests are stored but do not filter anything yet: asking now means the
 * answer exists when recommendations are built, instead of having to interrupt
 * everyone later to collect it.
 *
 * `onboarded` lives on the account, so this runs once per person rather than
 * once per install — reinstalling or adding a second phone must not ask again.
 */
const STEPS = ["intro", "interests", "look"];

const TAGS = [
  "Sports", "Food & Drink", "Study", "Music", "Art",
  "Tech", "Outdoors", "Gaming", "Social", "Fitness",
];

export default function WelcomeScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { profile, refreshProfile } = useAuth();

  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState([]);
  const [frame, setFrame] = useState("none");
  const [background, setBackground] = useState("default");
  const [face, setFace] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const max = profile?.max_interests || 5;

  function toggleInterest(tag) {
    setInterests((prev) =>
      prev.includes(tag)
        ? prev.filter((x) => x !== tag)
        // Silently ignoring the tap past the limit looks broken, so the chip
        // simply stops responding and the counter above explains why.
        : prev.length >= max ? prev : [...prev, tag]
    );
  }

  /**
   * Save and leave. `onboarded` is set even when everything was skipped —
   * the flow has been seen, and showing it again would be the annoying part.
   */
  async function finish() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      // The role was answered before this account existed, so it is carried
      // up from the device here — the first moment there is somewhere to put
      // it. Cleared afterwards so the account, not the phone, is the source of
      // truth from then on.
      const role = await getIntroRole();
      await api.updateProfile({
        interests, profile_frame: frame, profile_background: background,
        ...(face ? { avatar_face: face } : {}),
        ...(role ? { role } : {}),
        onboarded: true,
      });
      await clearIntroRole();
      // The navigator swaps to Home on its own once the profile says the
      // welcome is done, so there is no navigation call here.
      await refreshProfile();
    } catch (e) {
      setError(e.message || t("welcome.saveFailed"));
      setSaving(false);
    }
  }

  const gradient = backgroundFor(background, theme);
  const name = profile?.display_name || profile?.username || "";
  const initials = (name || "?").slice(0, 2).toUpperCase();

  return (
    <View style={styles.container}>
      {/* The same moving backdrop the profile uses, so the preview is honest
          about what the choice actually looks like. */}
      <AnimatedBackdrop colors={gradient} style={[styles.hero, { paddingTop: insets.top + 24 }]}>
        <ProfileAvatar
          size={96}
          frame={frame}
          face={face}
          initials={initials}
          color={profile?.profile_color}
        />
        <Text style={styles.heroName}>{name}</Text>
      </AnimatedBackdrop>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {STEPS[step] === "intro" && (
          <>
            <Text style={styles.title}>{t("welcome.title", { name })}</Text>
            <Text style={styles.sub}>{t("welcome.introBody")}</Text>
            <View style={styles.points}>
              <Point styles={styles} emoji="🗺️" text={t("welcome.point1")} />
              <Point styles={styles} emoji="🙋" text={t("welcome.point2")} />
              <Point styles={styles} emoji="⭐" text={t("welcome.point3")} />
            </View>
          </>
        )}

        {STEPS[step] === "interests" && (
          <>
            <Text style={styles.title}>{t("welcome.interestsTitle")}</Text>
            <Text style={styles.sub}>{t("welcome.interestsBody")}</Text>
            <Text style={styles.counter}>
              {t("welcome.interestsCount", { n: interests.length, max })}
            </Text>
            <View style={styles.chips}>
              {TAGS.map((tag) => {
                const on = interests.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleInterest(tag)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{tag}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {STEPS[step] === "look" && (
          <>
            <Text style={styles.title}>{t("welcome.lookTitle")}</Text>
            <Text style={styles.sub}>{t("welcome.lookBody")}</Text>

            <Text style={styles.section}>{t("welcome.sectionBackground")}</Text>
            <View style={styles.swatches}>
              {Object.keys(BACKGROUNDS).map((id) => (
                <Pressable key={id} onPress={() => setBackground(id)} style={styles.swatchWrap}>
                  <LinearGradient
                    colors={backgroundFor(id, theme)}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.swatch, background === id && styles.swatchOn]}
                  />
                  <Text style={styles.swatchLabel}>{t(BACKGROUNDS[id].labelKey)}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.section}>{t("welcome.sectionFrame")}</Text>
            <View style={styles.swatches}>
              {Object.keys(FRAMES).map((id) => (
                <Pressable key={id} onPress={() => setFrame(id)} style={styles.swatchWrap}>
                  <View style={[styles.framePreview, frame === id && styles.swatchOn]}>
                    <ProfileAvatar size={46} frame={id} face={face} initials={initials}
                                   color={profile?.profile_color} />
                  </View>
                  <Text style={styles.swatchLabel}>{t(FRAMES[id].labelKey)}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.section}>{t("welcome.sectionAvatar")}</Text>
            <View style={styles.chips}>
              {FACE_IDS.map((id) => (
                <Pressable
                  key={id}
                  // Tapping the chosen face again clears it, which is the only
                  // way back to initials in a flow with no "none" option.
                  onPress={() => setFace(face === id ? "" : id)}
                  style={[styles.faceChip, face === id && styles.faceChipOn]}
                >
                  <FaceAvatar id={id} size={44} />
                </Pressable>
              ))}
            </View>
          </>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.dots}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
        <View style={styles.actions}>
          {/* Skip is always available and always finishes: someone who does not
              want to answer should reach the map now, not be walked through the
              rest of the steps first. */}
          <TouchableOpacity onPress={finish} disabled={saving} style={styles.skip}>
            <Text style={styles.skipText}>{t("welcome.skip")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.next, saving && styles.nextBusy]}
            disabled={saving}
            onPress={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.nextText}>
                  {t(step === STEPS.length - 1 ? "welcome.finish" : "welcome.next")}
                </Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function Point({ emoji, text, styles }) {
  return (
    <View style={styles.point}>
      <Text style={styles.pointEmoji}>{emoji}</Text>
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  hero: { alignItems: "center", paddingBottom: 26, gap: 10 },
  heroName: { color: "#fff", fontSize: t.fs(18), fontFamily: FONTS.accent },
  body: { flex: 1 },
  title: { fontSize: t.fs(24), fontFamily: FONTS.accent, color: t.text, marginBottom: 8 },
  sub: { fontSize: t.fs(15), fontFamily: FONTS.body, color: t.text2, lineHeight: 21, marginBottom: 18 },
  counter: { fontSize: t.fs(12), fontFamily: FONTS.bodySemi, color: t.text3, marginBottom: 10 },
  points: { gap: 14, marginTop: 4 },
  point: { flexDirection: "row", alignItems: "center", gap: 12 },
  pointEmoji: { fontSize: t.fs(24) },
  pointText: { flex: 1, fontSize: t.fs(15), fontFamily: FONTS.body, color: t.text2, lineHeight: 21 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  chipOn: { backgroundColor: t.accentSoft || t.surface, borderColor: t.accent },
  chipText: { fontSize: t.fs(14), fontFamily: FONTS.bodySemi, color: t.text2 },
  chipTextOn: { color: t.accent },
  faceChip: {
    // Round, and big enough for a 44px face plus the ring, so selecting one
    // doesn't reflow the grid.
    width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    backgroundColor: t.surface, borderWidth: 2, borderColor: "transparent",
    overflow: "hidden",
  },
  faceChipOn: { borderColor: t.accent },
  section: {
    fontSize: t.fs(11), fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginTop: 22, marginBottom: 10,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  swatchWrap: { alignItems: "center", width: 74, gap: 6 },
  swatch: { width: 58, height: 58, borderRadius: 18, borderWidth: 2, borderColor: "transparent" },
  framePreview: {
    width: 58, height: 58, borderRadius: 18, alignItems: "center", justifyContent: "center",
    backgroundColor: t.surface2 || t.surface, borderWidth: 2, borderColor: "transparent",
  },
  swatchOn: { borderColor: t.accent },
  swatchLabel: { fontSize: t.fs(10), fontFamily: FONTS.body, color: t.text3, textAlign: "center" },
  error: { marginTop: 16, color: t.danger || "#dc2626", fontFamily: FONTS.body, fontSize: t.fs(14) },
  footer: {
    paddingHorizontal: 20, paddingTop: 12, gap: 12,
    borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.border },
  dotOn: { backgroundColor: t.accent, width: 18 },
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  skip: { paddingVertical: 14, paddingHorizontal: 12 },
  skipText: { fontSize: t.fs(15), fontFamily: FONTS.bodySemi, color: t.text3 },
  next: {
    flex: 1, backgroundColor: t.accent, borderRadius: RADIUS.md,
    paddingVertical: 15, alignItems: "center", justifyContent: "center",
  },
  nextBusy: { opacity: 0.7 },
  nextText: { color: "#fff", fontSize: t.fs(16), fontFamily: FONTS.accent },
});
