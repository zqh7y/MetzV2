import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ACCENTS, RADIUS, SHADOW } from "../styles/theme";
import { FONTS } from "../styles/fonts";
import { useI18n, SYSTEM } from "../context/LocaleContext";
import { LANGUAGES } from "../i18n";

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
  const { theme, choice, accentName, density, motion, minimaps, sheet, setTheme, setAccent, setPref, resetPrefs } =
    useTheme();
  const { profile, signOut } = useAuth();
  const { t, choice: langChoice, deviceLanguage, setLanguage, restartNeeded } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const role = profile?.is_admin
    ? t("settings.roleAdmin")
    : profile?.is_trusted ? t("settings.roleTrusted") : t("settings.roleMember");

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

      <Section styles={styles} title={`📐 ${t("settings.layoutMotion")}`}>
        <Block
          styles={styles}
          label={t("settings.density")}
          desc={t("settings.densityDesc")}
          value={density}
          options={[["compact", t("settings.compact")], ["comfortable", t("settings.comfortable")]]}
          onChange={(v) => setPref("density", v)}
        />
        <Block
          styles={styles}
          label={t("settings.animations")}
          desc={t("settings.animationsDesc")}
          value={motion}
          options={[["full", t("settings.motionFull")], ["reduced", t("settings.motionReduced")]]}
          onChange={(v) => setPref("motion", v)}
        />
      </Section>

      <Section styles={styles} title={`🗺️ ${t("settings.homeScreen")}`}>
        <Block
          styles={styles}
          label={t("settings.liveMaps")}
          desc={t("settings.liveMapsDesc")}
          value={minimaps}
          options={[["on", t("settings.on")], ["off", t("settings.off")]]}
          onChange={(v) => setPref("minimaps", v)}
        />
        <Block
          styles={styles}
          label={t("settings.panelPosition")}
          desc={t("settings.panelPositionDesc")}
          value={sheet}
          options={[["peek", t("settings.panelMap")], ["half", t("settings.panelSplit")], ["full", t("settings.panelList")]]}
          onChange={(v) => setPref("sheet", v)}
        />
      </Section>

      <Section
        styles={styles}
        title={`🌐 ${t("settings.language")}`}
        hint={t("settings.languageHint")}
      >
        {/* "System default" first and selected out of the box: following the
            phone is what most people want, and it is the only option that keeps
            working when they change the phone's language later. */}
        <LanguageRow
          styles={styles}
          label={t("settings.systemDefault")}
          sublabel={LANGUAGES.find((l) => l.code === deviceLanguage)?.label}
          active={langChoice === SYSTEM}
          onPress={() => setLanguage(SYSTEM)}
        />
        {LANGUAGES.map((lang) => (
          <LanguageRow
            key={lang.code}
            styles={styles}
            /* Each language is named in itself — "Hebrew" is no help to someone
               who only reads Hebrew, which is exactly who needs this row. */
            label={lang.label}
            active={langChoice === lang.code}
            onPress={() => setLanguage(lang.code)}
          />
        ))}
        {restartNeeded ? (
          /* Right-to-left is decided natively at process start, so a switch
             between an RTL and an LTR language cannot re-mirror a running app.
             Saying so is better than leaving half the layout looking broken. */
          <Text style={styles.restartNote}>{t("settings.restartNeeded")}</Text>
        ) : null}
      </Section>

      <Section styles={styles} title={`👤 ${t("settings.account")}`}>
        <Row styles={styles} label={t("settings.signedInAs")} value={profile?.email || "—"} />
        <Row styles={styles} label={t("settings.userId")} value={profile?.uid || "—"} />
        <Row styles={styles} label={t("settings.role")} value={role} />

        <Pressable style={styles.action} onPress={() => navigation.navigate("EditProfile")}>
          <Text style={styles.actionText}>{`✏️  ${t("nav.editProfile")}`}</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </Section>

      <Pressable style={styles.secondary} onPress={confirmReset}>
        <Text style={styles.secondaryText}>{`↺  ${t("settings.resetTitle")}`}</Text>
      </Pressable>

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

/** One language in the picker: name, optional sub-line, tick when chosen. */
function LanguageRow({ styles, label, sublabel, active, onPress }) {
  return (
    <Pressable
      style={[styles.langRow, active && styles.langRowActive]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.langLabel, active && styles.langLabelActive]}>{label}</Text>
        {sublabel ? <Text style={styles.langSub}>{sublabel}</Text> : null}
      </View>
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
  cardTitle: { fontSize: 16, fontFamily: FONTS.heading, color: t.text },
  cardHint: { fontSize: 12.5, color: t.text3, marginTop: 3, lineHeight: 18 },
  note: { fontSize: 11.5, color: t.text3, marginTop: 10, lineHeight: 16 },

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
  choiceLabel: { fontSize: 11.5, fontFamily: FONTS.bodySemi, color: t.text2, textAlign: "center" },
  choiceLabelActive: { color: t.accentStrong },
  check: { position: "absolute", top: 4, right: 6, fontSize: 11, color: t.accent, fontFamily: FONTS.accent },

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
  blockLabel: { fontSize: 14, fontFamily: FONTS.bodySemi, color: t.text },
  blockDesc: { fontSize: 12, color: t.text3, marginTop: 2, marginBottom: 8, lineHeight: 17 },
  segmented: { flexDirection: "row", backgroundColor: t.surface2, borderRadius: RADIUS.base, padding: 3 },
  segBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: RADIUS.base - 3 },
  segBtnActive: { backgroundColor: t.surface, ...SHADOW.s1 },
  segText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: t.text3 },
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
  langLabel: { fontSize: 15, fontFamily: FONTS.bodyMedium, color: t.text },
  langLabelActive: { color: t.accentStrong, fontFamily: FONTS.bodySemi },
  langSub: { fontSize: 12, color: t.text3, marginTop: 2 },
  restartNote: {
    fontSize: 12.5,
    lineHeight: 18,
    color: t.text2,
    marginTop: 10,
    padding: 10,
    borderRadius: RADIUS.base,
    backgroundColor: t.surface2,
  },
  infoLabel: { fontSize: 13, color: t.text3 },
  infoValue: { fontSize: 13.5, fontFamily: FONTS.bodySemi, color: t.text, flexShrink: 1 },

  action: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: RADIUS.base,
    backgroundColor: t.surface2,
  },
  actionText: { flex: 1, fontSize: 14.5, fontFamily: FONTS.bodySemi, color: t.text },
  chevron: { fontSize: 20, color: t.text3 },

  secondary: {
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: RADIUS.base,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    marginBottom: 10,
  },
  secondaryText: { color: t.text2, fontSize: 14.5, fontFamily: FONTS.accentMedium },

  logout: {
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: RADIUS.base,
    backgroundColor: "rgba(231, 76, 60, 0.08)",
  },
  logoutText: { color: t.status.bad, fontSize: 15, fontFamily: FONTS.accentMedium },

  danger: {
    marginTop: 22,
    padding: 16,
    borderRadius: RADIUS.lg,
    backgroundColor: t.status.badSoft,
    borderWidth: 1,
    borderColor: "rgba(192,57,43,0.3)",
  },
  dangerTitle: { fontSize: 15, fontFamily: FONTS.heading, color: t.status.bad },
  dangerBody: { fontSize: 12.5, lineHeight: 18, color: t.text2, marginTop: 6, marginBottom: 14 },
  dangerBtn: {
    alignSelf: "flex-start",
    borderRadius: RADIUS.base,
    borderWidth: 1,
    borderColor: t.status.bad,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  dangerBtnText: { color: t.status.bad, fontSize: 13.5, fontFamily: FONTS.accentMedium },
});
