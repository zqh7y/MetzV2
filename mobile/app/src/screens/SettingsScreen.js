import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ACCENTS, RADIUS, SHADOW } from "../styles/theme";
import { FONTS } from "../styles/fonts";

// Mirrors templates/settings.html section for section: Appearance, Accent
// colour, Layout & motion, Home screen, Account, then the actions row. Same
// options, same wording, same order, so the two apps read as one product.
const THEME_CHOICES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "Match system" },
];

const ACCENT_LABELS = { teal: "Teal", indigo: "Indigo", coral: "Coral", amber: "Amber" };

export default function SettingsScreen({ navigation }) {
  const { theme, choice, accentName, density, motion, minimaps, sheet, setTheme, setAccent, setPref, resetPrefs } =
    useTheme();
  const { profile, signOut } = useAuth();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const role = profile?.is_admin ? "Admin" : profile?.is_trusted ? "Trusted" : "Member";

  function confirmLogout() {
    Alert.alert("Log out", "You'll need to sign in again to see your meetings.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: signOut },
    ]);
  }

  function confirmReset() {
    Alert.alert("Reset to defaults", "Every preference on this screen goes back to how it started.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: resetPrefs },
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
      "Delete your account?",
      "This removes your profile, the meetings you created, and your place in meetings you joined.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => Alert.alert(
            "This cannot be undone",
            "There is no way to get the account back afterwards.",
            [
              { text: "Keep my account", style: "cancel" },
              { text: "Delete permanently", style: "destructive", onPress: reallyDelete },
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
      Alert.alert("Couldn't delete", e.message || "Something went wrong. Try again.");
      return;
    }
    // The account is gone either way, so the session must not survive it.
    signOut();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Section styles={styles} title="🎨 Appearance" hint="Choose how Metz looks. Your choices are remembered on this device.">
        <View style={styles.row}>
          {THEME_CHOICES.map((option) => (
            <Choice
              key={option.id}
              styles={styles}
              label={option.label}
              active={choice === option.id}
              onPress={() => setTheme(option.id)}
            >
              <ThemeSwatch styles={styles} id={option.id} theme={theme} />
            </Choice>
          ))}
        </View>
        <Text style={styles.note}>The map follows your choice — a warm basemap in light, a dark one in dark.</Text>
      </Section>

      <Section styles={styles} title="💧 Accent colour" hint="Used for buttons, links, map pins and highlights.">
        <View style={styles.row}>
          {Object.keys(ACCENTS).map((name) => (
            <Choice
              key={name}
              styles={styles}
              label={ACCENT_LABELS[name] || name}
              active={accentName === name}
              onPress={() => setAccent(name)}
            >
              <View style={[styles.accentDot, { backgroundColor: ACCENTS[name].accent }]} />
            </Choice>
          ))}
        </View>
      </Section>

      <Section styles={styles} title="📐 Layout & motion">
        <Block
          styles={styles}
          label="Density"
          desc="How much fits on screen at once."
          value={density}
          options={[["compact", "Compact"], ["comfortable", "Comfortable"]]}
          onChange={(v) => setPref("density", v)}
        />
        <Block
          styles={styles}
          label="Animations"
          desc="Turn off if motion bothers you or the app feels slow."
          value={motion}
          options={[["full", "Full"], ["reduced", "Reduced"]]}
          onChange={(v) => setPref("motion", v)}
        />
      </Section>

      <Section styles={styles} title="🗺️ Home screen">
        <Block
          styles={styles}
          label="Live maps on “For You” cards"
          desc="Real maps look better but use more battery."
          value={minimaps}
          options={[["on", "On"], ["off", "Off"]]}
          onChange={(v) => setPref("minimaps", v)}
        />
        <Block
          styles={styles}
          label="Panel position on open"
          desc="How much map you see when Home loads."
          value={sheet}
          options={[["peek", "Map"], ["half", "Split"], ["full", "List"]]}
          onChange={(v) => setPref("sheet", v)}
        />
      </Section>

      <Section styles={styles} title="👤 Account">
        <Row styles={styles} label="Signed in as" value={profile?.email || "—"} />
        <Row styles={styles} label="User ID" value={profile?.uid || "—"} />
        <Row styles={styles} label="Role" value={role} />

        <Pressable style={styles.action} onPress={() => navigation.navigate("EditProfile")}>
          <Text style={styles.actionText}>✏️  Edit profile</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </Section>

      <Pressable style={styles.secondary} onPress={confirmReset}>
        <Text style={styles.secondaryText}>↺  Reset to defaults</Text>
      </Pressable>

      <Pressable style={styles.logout} onPress={confirmLogout}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>

      {/* Boxed off and last: the only control here that cannot be undone, and
          it has to be reachable in-app for the stores. */}
      <View style={styles.danger}>
        <Text style={styles.dangerTitle}>Delete your account</Text>
        <Text style={styles.dangerBody}>
          Removes your profile, the meetings you created, and your place in meetings
          you joined. This cannot be undone.
        </Text>
        <Pressable style={styles.dangerBtn} onPress={confirmDelete}>
          <Text style={styles.dangerBtnText}>Delete my account</Text>
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
