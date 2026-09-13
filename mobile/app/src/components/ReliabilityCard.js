import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS, SHADOW } from "../styles/theme";
import CountUp from "./CountUp";

/**
 * Which band the score falls in, repeating the thresholds in
 * data.get_reliability().
 *
 * The server sends the band as a finished English sentence in
 * `reliability.label` ("Hit and miss", "Always shows up"). That cannot be
 * translated on this side — it arrives as prose, not as a code — so the whole
 * card sat in English on a Hebrew or Russian screen. Deriving the band from
 * the score instead means the app names it in its own language.
 *
 * Duplicating the numbers is the cost, and they have to stay in step with
 * data.py. It is the smaller of the two evils: the alternative is the server
 * sending a key, which changes the API for every existing client.
 */
function bandKey(score) {
  if (score == null) return "reliability.bandNone";
  if (score >= 90) return "reliability.bandAlways";
  if (score >= 70) return "reliability.bandUsually";
  if (score >= 40) return "reliability.bandMixed";
  return "reliability.bandRarely";
}

/**
 * The attendance record — .reliability-card from profile.html / user_profile.html.
 *
 * The score is deliberately absent rather than zero when nothing has settled
 * yet: data.get_reliability() returns None there, and "—" says "no record"
 * where a 0% would read as an accusation. The colour bands are the template's
 * own: 70+ good, 40+ mixed, below that poor, and grey when there is no score.
 *
 * `showPending` is what separates the two screens. Your own profile lists the
 * meetings still waiting on an answer, because that chip is a nudge to go and
 * settle them; another person's profile shows only the settled counts, since
 * their unanswered meetings are not the viewer's business.
 *
 * `facts` and `roles` are optional and render inside this card rather than
 * beside it. The show-up rate and the figures under it are the same story —
 * how many you turned up to, out of how many, with whom — and as two separate
 * cards they read as unrelated trivia. `facts` is where "Attended" lives, and
 * it is the very number the percentage above is calculated from.
 */
export default function ReliabilityCard({
  reliability, showPending = false, style, facts, roles,
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (!reliability) return null;

  // `label` is deliberately not read off the response any more — see bandKey.
  const { score, went = 0, missed = 0, pending = 0 } = reliability;
  const scoreColor =
    score == null ? theme.text3
      : score >= 70 ? theme.status.good
      : score >= 40 ? theme.status.warn
      : theme.status.bad;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.main}>
        {score == null ? (
          <Text style={[styles.score, styles.scoreEmpty, { color: scoreColor }]}>—</Text>
        ) : (
          <View style={styles.scoreRow}>
            {/* Counting up to the score makes it read as something earned
                rather than a figure that was always sitting there. */}
            <CountUp value={score} style={[styles.score, { color: scoreColor }]} />
            <Text style={[styles.pct, { color: scoreColor }]}>%</Text>
          </View>
        )}
        <View style={styles.text}>
          <Text style={styles.title}>{t("reliability.title")}</Text>
          <Text style={styles.label}>{t(bandKey(score))}</Text>
        </View>
      </View>

      <View style={styles.breakdown}>
        <Text style={[styles.chip, styles.chipWent]}>✓ {t("reliability.went", { count: went })}</Text>
        <Text style={[styles.chip, styles.chipMissed]}>✕ {t("reliability.missed", { count: missed })}</Text>
        {showPending && pending ? (
          <Text style={[styles.chip, styles.chipPending]}>⏳ {t("reliability.toConfirm", { count: pending })}</Text>
        ) : null}
      </View>

      {facts && facts.length ? (
        <>
          <View style={styles.rule} />
          <View style={styles.facts}>
            {facts.map((f) => (
              <View key={f.label} style={styles.fact}>
                <Text style={styles.factValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {f.value}
                </Text>
                <Text style={styles.factLabel} numberOfLines={2}>{f.label}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {roles && roles.length ? (
        <View style={styles.roles}>
          {roles.map((r) => (
            <Text key={r} style={styles.role}>{r}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    paddingVertical: 16,
    paddingHorizontal: 18,
    ...SHADOW.s1,
  },
  main: { flexDirection: "row", alignItems: "center" },
  scoreRow: { flexDirection: "row", alignItems: "flex-end", marginEnd: 16 },
  // The em-dash case carries its own gap; inside scoreRow the row supplies it.
  score: { fontFamily: FONTS.accent, fontSize: t.fs(38), lineHeight: 40 },
  scoreEmpty: { marginEnd: 16 },
  pct: { fontFamily: FONTS.accent, fontSize: t.fs(20), lineHeight: 28 },
  text: { flex: 1 },
  title: { fontFamily: FONTS.heading, fontSize: t.fs(15), color: t.text },
  label: { fontSize: t.fs(13), color: t.text2, marginTop: 1 },
  breakdown: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    fontSize: t.fs(12),
    fontFamily: FONTS.bodySemi,
    backgroundColor: t.surface2,
    color: t.text2,
    overflow: "hidden",
  },
  rule: { height: 1, backgroundColor: t.border, marginTop: 16 },
  facts: { flexDirection: "row", marginTop: 14 },
  fact: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  factValue: { fontFamily: FONTS.accent, fontSize: t.fs(19), color: t.text },
  factLabel: {
    fontSize: t.fs(10), fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginTop: 3, textAlign: "center",
  },
  roles: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  role: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: RADIUS.pill,
    fontSize: t.fs(12), fontFamily: FONTS.bodySemi,
    backgroundColor: t.accentSoft || t.surface2, color: t.accent, overflow: "hidden",
  },
  chipWent: { color: t.status.good, backgroundColor: t.status.goodSoft },
  chipMissed: { color: t.status.bad, backgroundColor: t.status.badSoft },
  chipPending: { color: t.status.warn, backgroundColor: t.status.warnSoft },
});
