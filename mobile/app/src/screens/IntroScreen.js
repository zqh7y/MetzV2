import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, TouchableOpacity } from "react-native";

import AuthLayout from "../components/AuthLayout";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { LANGUAGES } from "../i18n";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import { setIntroRole, markIntroSeen } from "../intro";

/**
 * The first thing a new install shows, before login or sign-up.
 *
 * Landing a stranger on a login form asks them to commit before anything has
 * explained what they would be committing to. This says what Metz is, asks the
 * one question that changes what the app puts in front of them, and only then
 * hands over to the account screens.
 *
 * Built on AuthLayout rather than resembling it. The intro and the login form
 * are two steps of one flow, so they share the shell outright — the brand, the
 * card, the entry animation — and cannot drift apart the way two screens
 * *styled* to match eventually would.
 *
 * The answer is kept on the device because there is no account yet to keep it
 * on; WelcomeScreen sends it up once one exists. It steers what is shown and
 * nothing more — it is not a permission, and Settings can change it — so
 * nothing may depend on it being true.
 */
export default function IntroScreen({ navigation }) {
  const { theme, setPref, prefs } = useTheme();
  const { t, choice: langChoice, setLanguage } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [step, setStep] = useState(0);
  const [role, setRole] = useState(null);

  async function finish(chosen) {
    await setIntroRole(chosen);
    await markIntroSeen();
    // replace, not navigate: the intro is done and going "back" into it from
    // the login form would be a dead end.
    navigation.replace("Signup");
  }

  // Language and appearance come before anything is asked of them: a welcome
  // in a language someone does not read is not a welcome, and the two settings
  // people most often want on day one were buried in Settings behind an
  // account they did not have yet.
  if (step === 1) {
    return (
      <AuthLayout
        title={t("intro.lookTitle")}
        subtitle={t("intro.lookSubtitle")}
        footer={
          <TouchableOpacity onPress={() => setStep(0)}>
            <Text style={styles.link}>{t("common.back")}</Text>
          </TouchableOpacity>
        }
      >
        <Text style={styles.section}>{t("settings.language")}</Text>
        <View style={styles.wrap}>
          {LANGUAGES.map((lang) => (
            <Pressable
              key={lang.code}
              onPress={() => setLanguage(lang.code)}
              style={[styles.pill, langChoice === lang.code && styles.pillOn]}
            >
              <Text style={[styles.pillText, langChoice === lang.code && styles.pillTextOn]}>
                {lang.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.section}>{t("settings.appearance")}</Text>
        <View style={styles.wrap}>
          {[["light", t("settings.themeLight")], ["dark", t("settings.themeDark")], ["system", t("settings.themeSystem")]]
            .map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setPref("theme", value)}
                style={[styles.pill, prefs?.theme === value && styles.pillOn]}
              >
                <Text style={[styles.pillText, prefs?.theme === value && styles.pillTextOn]}>
                  {label}
                </Text>
              </Pressable>
            ))}
        </View>

        <TouchableOpacity style={styles.primary} onPress={() => setStep(2)} activeOpacity={0.85}>
          <Text style={styles.primaryText}>{t("intro.continue")}</Text>
        </TouchableOpacity>
      </AuthLayout>
    );
  }

  if (step === 0) {
    return (
      <AuthLayout
        title={t("intro.title")}
        subtitle={t("intro.subtitle")}
        footer={
          <TouchableOpacity onPress={() => navigation.replace("Login")}>
            <Text style={styles.link}>{t("intro.haveAccount")}</Text>
          </TouchableOpacity>
        }
      >
        <View style={styles.points}>
          <Point styles={styles} emoji="🗺️" text={t("intro.point1")} />
          <Point styles={styles} emoji="🙋" text={t("intro.point2")} />
          <Point styles={styles} emoji="⭐" text={t("intro.point3")} />
        </View>

        <TouchableOpacity style={styles.primary} onPress={() => setStep(1)} activeOpacity={0.85}>
          <Text style={styles.primaryText}>{t("intro.start")}</Text>
        </TouchableOpacity>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t("intro.roleTitle")}
      subtitle={t("intro.roleSubtitle")}
      footer={
        <TouchableOpacity onPress={() => setStep(1)}>
          <Text style={styles.link}>{t("common.back")}</Text>
        </TouchableOpacity>
      }
    >
      <RoleCard
        styles={styles}
        emoji="🔍"
        title={t("intro.roleMemberTitle")}
        body={t("intro.roleMemberBody")}
        selected={role === "member"}
        onPress={() => setRole("member")}
      />
      <RoleCard
        styles={styles}
        emoji="📣"
        title={t("intro.roleOrganiserTitle")}
        body={t("intro.roleOrganiserBody")}
        selected={role === "organiser"}
        onPress={() => setRole("organiser")}
      />

      <TouchableOpacity
        style={[styles.primary, !role && styles.primaryOff]}
        disabled={!role}
        onPress={() => finish(role)}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryText}>{t("intro.continue")}</Text>
      </TouchableOpacity>

      {/* Neither answer locks anything, and saying so is what makes the
          question easy to answer rather than something to deliberate over. */}
      <Text style={styles.reassure}>{t("intro.changeLater")}</Text>
    </AuthLayout>
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

function RoleCard({ emoji, title, body, selected, onPress, styles }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.roleCard, selected && styles.roleCardOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={styles.roleEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.roleTitle, selected && styles.roleTitleOn]}>{title}</Text>
        <Text style={styles.roleBody}>{body}</Text>
      </View>
      <View style={[styles.tick, selected && styles.tickOn]}>
        {selected ? <Text style={styles.tickMark}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (t) => StyleSheet.create({
  points: { gap: 16, marginBottom: 26 },
  section: {
    fontSize: t.fs(11), fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginBottom: 10, marginTop: 4,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  pill: {
    paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999,
    backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border,
  },
  pillOn: { backgroundColor: t.accentSoft, borderColor: t.accent },
  pillText: { fontSize: t.fs(13), fontFamily: FONTS.bodySemi, color: t.text2 },
  pillTextOn: { color: t.accentStrong },
  point: { flexDirection: "row", alignItems: "center", gap: 12 },
  pointEmoji: { fontSize: t.fs(22) },
  pointText: { flex: 1, fontSize: t.fs(14.5), color: t.text2, fontFamily: FONTS.body, lineHeight: 20 },
  roleCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    padding: 16, borderRadius: RADIUS.lg, marginBottom: 12,
    backgroundColor: t.surface2, borderWidth: 1.5, borderColor: t.border,
  },
  roleCardOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  roleEmoji: { fontSize: t.fs(26) },
  roleTitle: { fontSize: t.fs(15.5), fontFamily: FONTS.heading, color: t.text },
  roleTitleOn: { color: t.accentStrong },
  roleBody: { fontSize: t.fs(13), color: t.text2, fontFamily: FONTS.body, marginTop: 3, lineHeight: 18 },
  tick: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: t.border,
    alignItems: "center", justifyContent: "center", backgroundColor: "transparent",
  },
  tickOn: { backgroundColor: t.accent, borderColor: t.accent },
  tickMark: { color: "#fff", fontSize: t.fs(13), fontFamily: FONTS.accent },
  primary: {
    backgroundColor: t.accent, borderRadius: RADIUS.md,
    paddingVertical: 15, alignItems: "center", marginTop: 8,
  },
  primaryOff: { opacity: 0.45 },
  primaryText: { color: "#fff", fontSize: t.fs(16), fontFamily: FONTS.accent },
  reassure: {
    marginTop: 12, textAlign: "center", fontSize: t.fs(12),
    color: t.text3, fontFamily: FONTS.body,
  },
  link: { color: t.accentStrong, fontSize: t.fs(14), fontFamily: FONTS.bodySemi, textAlign: "center" },
});
