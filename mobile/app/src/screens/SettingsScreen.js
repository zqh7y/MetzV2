import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ACCENTS, RADIUS, SHADOW } from "../styles/theme";
import { FONTS } from "../styles/fonts";
import { IS_HOST } from "../variant";
import { useI18n, SYSTEM } from "../context/LocaleContext";
import { LANGUAGES } from "../i18n";
import { Alert } from "../components/AppAlert";

// Mirrors templates/settings.html section for section: Appearance, Accent
// colour, Layout & motion, Home screen, Account, then the actions row. Same
// options, same wording, same order, so the two apps read as one product.
const THEME_CHOICES = [
  { id: "light", labelKey: "settings.themeLight" },
  { id: "dark", labelKey: "settings.themeDark" },
  { id: "system", labelKey: "settings.themeSystem" },
];

const ACCENT_LABEL_KEYS = {
  teal: "settings.accentTeal", indigo: "settings.accentIndigo",
  coral: "settings.accentCoral", amber: "settings.accentAmber",
};

export default function SettingsScreen({ navigation }) {
  const { theme, choice, accentName, motion, textSize, setTheme, setAccent, setPref, resetPrefs } =
    useTheme();
  const { profile, signOut, refreshProfile } = useAuth();
  const { t, choice: langChoice, deviceLanguage, setLanguage, restartNeeded } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const role = profile?.is_admin
    ? t("settings.roleAdmin")
    : profile?.is_trusted ? t("settings.roleTrusted") : t("settings.roleMember");

  /**
   * The eight language rows are collapsed behind the current choice.
   *
   * Listed all at once they were the tallest thing in Settings by some way —
   * seven names plus "System default", pushing Account and everything under it
   * off the bottom of a screen most people opened for the theme. Only one of
   * the eight is ever true at a time, so the closed state can simply say which.
   */
  const [langOpen, setLangOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const currentLang = LANGUAGES.find((l) => l.code === langChoice);
  const deviceLang = LANGUAGES.find((l) => l.code === deviceLanguage);

  function confirmLogout() {
    Alert.alert(t("account.logOut"), t("settings.logoutBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("account.logOut"), style: "destructive", onPress: signOut },
    ]);
  }

  function confirmReset() {
    Alert.alert(t("settings.resetTitle"), t("settings.resetBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("settings.reset"), style: "destructive", onPress: resetPrefs },
    ]);
  }

  /**
   * Two prompts, not one.
   *
   * Deletion is irreversible and sits a few millimetres from "Log out", which
   * is not. One tap-through is too easy to do by accident, so the second
   * prompt spells out what actually goes.
   */
  function confirmDelete() {
    Alert.alert(
      t("settings.deleteTitle"),
      t("settings.deleteBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.continue"),
          style: "destructive",
          onPress: () => Alert.alert(
            t("settings.deleteConfirmTitle"),
            t("settings.deleteConfirmBody"),
            [
              { text: t("settings.keepAccount"), style: "cancel" },
              { text: t("settings.deletePermanently"), style: "destructive", onPress: reallyDelete },
            ]
          ),
        },
      ]
    );
  }

  async function reallyDelete() {
    try {
      await api.deleteAccount();
    } catch (e) {
      Alert.alert(t("settings.deleteFailed"), e.message || t("common.somethingWentWrong"));
      return;
    }
    // The account is gone either way, so the session must not survive it.
    signOut();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      {/* Everything from here to the language picker is comfort, not
          organising. Metz Host is three screens and a form; a theme, an
          accent, a text scale and a motion preference are four decisions to
          make before posting a meeting, and none of them help post it.
          Appearance still follows the phone's own light/dark setting. */}
      {IS_HOST ? null : (<>
      <Section styles={styles} title={`🎨 ${t("settings.appearance")}`} hint={t("settings.appearanceHint")}>
        <View style={styles.row}>
          {THEME_CHOICES.map((option) => (
            <Choice
              key={option.id}
              styles={styles}
              label={t(option.labelKey)}
              active={choice === option.id}
              onPress={() => setTheme(option.id)}
            >
              <ThemeSwatch styles={styles} id={option.id} theme={theme} />
            </Choice>
          ))}
        </View>
        <Text style={styles.note}>{t("settings.themeNote")}</Text>
      </Section>

      <Section styles={styles} title={`💧 ${t("settings.accent")}`} hint={t("settings.accentHint")}>
        <View style={styles.row}>
          {Object.keys(ACCENTS).map((name) => (
            <Choice
              key={name}
              styles={styles}
              label={t(ACCENT_LABEL_KEYS[name]) || name}
              active={accentName === name}
              onPress={() => setAccent(name)}
            >
              <View style={[styles.accentDot, { backgroundColor: ACCENTS[name].accent }]} />
            </Choice>
          ))}
        </View>
      </Section>

      {/* Replaces "Layout & motion" and "Home screen".
          Density changed six pixels of padding and the panel position only
          applied on a cold start — two controls that read as settings and
          behaved like decoration. Text size and units are things a person can
          actually feel the effect of. Reduced motion stays: it is an
          accessibility setting that genuinely works, and dropping it to tidy
          up would cost someone who needs it. */}
      <Section styles={styles} title={`\u{1F524} ${t("settings.textSize")}`}>
        <Block
          styles={styles}
          label={t("settings.textSize")}
          desc={t("settings.textSizeDesc")}
          value={textSize}
          options={[
            ["small", t("settings.textSmall")],
            ["default", t("settings.textDefault")],
            ["large", t("settings.textLarge")],
            ["larger", t("settings.textLarger")],
          ]}
          onChange={(v) => setPref("textSize", v)}
        />
        {/* Shown at the size that is actually selected, so the choice can be
            judged by reading it rather than by guessing from a label. */}
        <Text style={styles.sample}>{t("settings.textSample")}</Text>

        <Block
          styles={styles}
          label={t("settings.animations")}
          desc={t("settings.animationsDesc")}
          value={motion}
          options={[["full", t("settings.motionFull")], ["reduced", t("settings.motionReduced")]]}
          onChange={(v) => setPref("motion", v)}
        />
      </Section>
      </>)}
      {/* The intro asked this before there was an account to keep it on. A
          wrong tap at sign-up should not be permanent, and someone who joined
          to attend and started organising should be able to say so. */}
      {/* "What are you here to do" has one answer in an app that can only
          do one of them. */}
      {IS_HOST ? null : (<>
      <Section
        styles={styles}
        title={`🎯 ${t("settings.hereTo")}`}
        hint={t("settings.hereToHint")}
      >
        <LanguageRow
          styles={styles}
          label={t(profile?.role === "organiser" ? "intro.roleOrganiserTitle" : "intro.roleMemberTitle")}
          chevron={roleOpen ? "▴" : "▾"}
          onPress={() => setRoleOpen((v) => !v)}
        />
        {roleOpen ? (
          <>
            {["member", "organiser"].map((r) => (
              <LanguageRow
                key={r}
                styles={styles}
                indent
                label={t(r === "organiser" ? "intro.roleOrganiserTitle" : "intro.roleMemberTitle")}
                sublabel={t(r === "organiser" ? "intro.roleOrganiserBody" : "intro.roleMemberBody")}
                active={(profile?.role || "member") === r}
                onPress={async () => {
                  setRoleOpen(false);
                  if ((profile?.role || "member") === r) return;
                  try {
                    await api.updateProfile({ role: r });
                    // Home reads the role off the profile, so it has to be
                    // refetched for the change to be visible at all.
                    await refreshProfile();
                  } catch {
                    // Left as it was; the row still shows what the server has.
                  }
                }}
              />
            ))}
          </>
        ) : null}
      </Section>
      </>)}

      <Section
        styles={styles}
        title={`🌐 ${t("settings.language")}`}
        hint={t("settings.languageHint")}
      >
        {/* Closed: the one that is actually set, and a chevron. */}
        <LanguageRow
          styles={styles}
          label={langChoice === SYSTEM ? t("settings.systemDefault") : currentLang?.label}
          sublabel={langChoice === SYSTEM ? deviceLang?.label : null}
          chevron={langOpen ? "▴" : "▾"}
          onPress={() => setLangOpen((v) => !v)}
        />

        {langOpen ? (
          <>
            {/* "System default" first and selected out of the box: following the
                phone is what most people want, and it is the only option that
                keeps working when they change the phone's language later. */}
            <LanguageRow
              styles={styles}
              indent
              label={t("settings.systemDefault")}
              sublabel={deviceLang?.label}
              active={langChoice === SYSTEM}
              onPress={() => { setLanguage(SYSTEM); setLangOpen(false); }}
            />
            {LANGUAGES.map((lang) => (
              <LanguageRow
                key={lang.code}
                styles={styles}
                indent
                /* Each language is named in itself — "Hebrew" is no help to
                   someone who only reads Hebrew, which is exactly who needs
                   this row. */
                label={lang.label}
                active={langChoice === lang.code}
                onPress={() => { setLanguage(lang.code); setLangOpen(false); }}
              />
            ))}
          </>
        ) : null}
        {restartNeeded ? (
          /* Right-to-left is decided natively at process start, so a switch
             between an RTL and an LTR language cannot re-mirror a running app.
             Saying so is better than leaving half the layout looking broken. */
          <Text style={styles.restartNote}>{t("settings.restartNeeded")}</Text>
        ) : null}
      </Section>

      <Section styles={styles} title={`👤 ${t("settings.account")}`}>
        <Row styles={styles} label={t("settings.signedInAs")} value={profile?.email || "—"} />
        {/* The uid is for Find People and the role is for moderation, and
            Host has neither. The address you signed in with is the one thing
            here worth being able to check. */}
        {IS_HOST ? null : (<>
          <Row styles={styles} label={t("settings.userId")} value={profile?.uid || "—"} />
          <Row styles={styles} label={t("settings.role")} value={role} />
        </>)}

        {/* The form lives inside Profile now, so this asks Profile to open on
            it rather than pushing a screen that no longer exists. */}
        <Pressable style={styles.action} onPress={() => navigation.navigate("Profile", { edit: true })}>
          <Text style={styles.actionText}>{`✏️  ${t("nav.editProfile")}`}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </Section>

      {/* Nothing left to reset once the preferences above are gone. */}
      {IS_HOST ? null : (<>
      <Pressable style={styles.secondary} onPress={confirmReset}>
        <Text style={styles.secondaryText}>{`↺  ${t("settings.resetTitle")}`}</Text>
      </Pressable>
      </>)}

      <Pressable style={styles.logout} onPress={confirmLogout}>
        <Text style={styles.logoutText}>{t("account.logOut")}</Text>
      </Pressable>

      {/* Boxed off and last: the only control here that cannot be undone, and
          it has to be reachable in-app for the stores. */}
      <View style={styles.danger}>
        <Text style={styles.dangerTitle}>{t("settings.dangerTitle")}</Text>
        <Text style={styles.dangerBody}>{t("settings.dangerBody")}</Text>
        <Pressable style={styles.dangerBtn} onPress={confirmDelete}>
          <Text style={styles.dangerBtnText}>{t("settings.deleteMyAccount")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Section({ title, hint, children, styles }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {hint ? <Text style={styles.cardHint}>{hint}</Text> : null}
      <View style={{ marginTop: 12 }}>{children}</View>
    </View>
  );
}

function Choice({ label, active, onPress, children, styles }) {
  return (
    <Pressable style={[styles.choice, active && styles.choiceActive]} onPress={onPress}>
      {children}
      <Text style={[styles.choiceLabel, active && styles.choiceLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      {active ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
}

/** The little light/dark/system preview the web draws with two spans. */
function ThemeSwatch({ id, theme, styles }) {
  const palette =
    id === "dark"
      ? { bg: "#171b23", bar: "#3a4150" }
      : id === "light"
      ? { bg: "#ffffff", bar: "#d8dee7" }
      : { bg: "#ffffff", bar: "#3a4150" };   // "system" is drawn split
  return (
    <View style={[styles.swatch, { backgroundColor: palette.bg }]}>
      <View style={[styles.swatchBar, { backgroundColor: palette.bar }]} />
      <View style={[styles.swatchDot, { backgroundColor: theme.accent }]} />
    </View>
  );
}

/**
 * One language in the picker: name, optional sub-line, tick when chosen.
 *
 * Doubles as the closed summary row, which shows a chevron instead of a tick
 * and is a button rather than a radio — it opens the list, it does not pick.
 */
function LanguageRow({ styles, label, sublabel, active, onPress, chevron, indent }) {
  return (
    <Pressable
      style={[styles.langRow, indent && styles.langRowIndent, active && styles.langRowActive]}
      onPress={onPress}
      accessibilityRole={chevron ? "button" : "radio"}
      accessibilityState={chevron ? { expanded: chevron === "▴" } : { selected: active }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.langLabel, active && styles.langLabelActive]}>{label}</Text>
        {sublabel ? <Text style={styles.langSub}>{sublabel}</Text> : null}
      </View>
      {chevron ? <Text style={styles.langChevron}>{chevron}</Text> : null}
      {active ? <Text style={styles.check}>✓</Text> : null}
    </Pressable>
  );
}

function Block({ label, desc, value, options, onChange, styles }) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockLabel}>{label}</Text>
      <Text style={styles.blockDesc}>{desc}</Text>
      <View style={styles.segmented}>
        {options.map(([id, text]) => {
          const active = value === id;
          return (
            <Pressable
              key={id}
              style={[styles.segBtn, active && styles.segBtnActive]}
              onPress={() => onChange(id)}
            >
              <Text style={[styles.segText, active && styles.segTextActive]}>{text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Row({ label, value, styles }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  sample: {
    fontSize: t.fs(15), lineHeight: t.fs(22), color: t.text2,
    fontFamily: FONTS.body, marginTop: 12,
    backgroundColor: t.surface2, borderRadius: RADIUS.md, padding: 12,
  },
  container: { flex: 1, backgroundColor: t.bg },

  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
    marginBottom: 14,
    ...SHADOW.s1,
  },
  cardTitle: { fontSize: t.fs(16), fontFamily: FONTS.heading, color: t.text },
  cardHint: { fontSize: t.fs(12.5), color: t.text3, marginTop: 3, lineHeight: 18 },
  note: { fontSize: t.fs(11.5), color: t.text3, marginTop: 10, lineHeight: 16 },

  row: { flexDirection: "row", gap: 8 },
  choice: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: RADIUS.base,
    backgroundColor: t.surface2,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  choiceActive: { backgroundColor: t.accentSoft, borderColor: t.accent },
  choiceLabel: { fontSize: t.fs(11.5), fontFamily: FONTS.bodySemi, color: t.text2, textAlign: "center" },
  choiceLabelActive: { color: t.accentStrong },
  check: { position: "absolute", top: 4, right: 6, fontSize: t.fs(11), color: t.accent, fontFamily: FONTS.accent },

  swatch: {
    width: 38,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: t.border,
    padding: 5,
    justifyContent: "space-between",
  },
  swatchBar: { height: 3, borderRadius: 2, width: "80%" },
  swatchDot: { width: 8, height: 8, borderRadius: 4 },

  accentDot: { width: 28, height: 28, borderRadius: 14 },

  block: { marginBottom: 16 },
  blockLabel: { fontSize: t.fs(14), fontFamily: FONTS.bodySemi, color: t.text },
  blockDesc: { fontSize: t.fs(12), color: t.text3, marginTop: 2, marginBottom: 8, lineHeight: 17 },
  segmented: { flexDirection: "row", backgroundColor: t.surface2, borderRadius: RADIUS.base, padding: 3 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: RADIUS.base - 3 },
  segBtnActive: { backgroundColor: t.surface, ...SHADOW.s1 },
  segText: { fontSize: t.fs(12.5), fontFamily: FONTS.bodySemi, color: t.text3 },
  segTextActive: { color: t.accentStrong },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: RADIUS.base,
    borderWidth: 1,
    borderColor: "transparent",
    marginBottom: 4,
  },
  langRowActive: { borderColor: t.accent, backgroundColor: t.accentSoft },
  // Stepped in from the summary row above them, so the open list reads as
  // belonging to it rather than as eight more settings.
  langRowIndent: { marginStart: 14 },
  langChevron: { fontSize: t.fs(13), color: t.text3, paddingHorizontal: 2 },
  langLabel: { fontSize: t.fs(15), fontFamily: FONTS.bodyMedium, color: t.text },
  langLabelActive: { color: t.accentStrong, fontFamily: FONTS.bodySemi },
  langSub: { fontSize: t.fs(12), color: t.text3, marginTop: 2 },
  restartNote: {
    fontSize: t.fs(12.5),
    lineHeight: 18,
    color: t.text2,
    marginTop: 10,
    padding: 10,
    borderRadius: RADIUS.base,
    backgroundColor: t.surface2,
  },
  infoLabel: { fontSize: t.fs(13), color: t.text3 },
  infoValue: { fontSize: t.fs(13.5), fontFamily: FONTS.bodySemi, color: t.text, flexShrink: 1 },

  action: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: RADIUS.base,
    backgroundColor: t.surface2,
  },
  actionText: { flex: 1, fontSize: t.fs(14.5), fontFamily: FONTS.bodySemi, color: t.text },
  chevron: { fontSize: t.fs(20), color: t.text3 },

  secondary: {
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: RADIUS.base,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    marginBottom: 10,
  },
  secondaryText: { color: t.text2, fontSize: t.fs(14.5), fontFamily: FONTS.accentMedium },

  logout: {
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: RADIUS.base,
    backgroundColor: "rgba(231, 76, 60, 0.08)",
  },
  logoutText: { color: t.status.bad, fontSize: t.fs(15), fontFamily: FONTS.accentMedium },

  danger: {
    marginTop: 22,
    padding: 16,
    borderRadius: RADIUS.lg,
    backgroundColor: t.status.badSoft,
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.3)",
  },
  dangerTitle: { fontSize: t.fs(15), fontFamily: FONTS.heading, color: t.status.bad },
  dangerBody: { fontSize: t.fs(12.5), lineHeight: 18, color: t.text2, marginTop: 6, marginBottom: 14 },
  dangerBtn: {
    alignSelf: "flex-start",
    borderRadius: RADIUS.base,
    borderWidth: 1,
    borderColor: t.status.bad,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  dangerBtnText: { color: t.status.bad, fontSize: t.fs(13.5), fontFamily: FONTS.accentMedium },
});
