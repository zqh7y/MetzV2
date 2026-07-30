import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { RADIUS, SHADOW } from "../styles/theme";
import CountUp from "./CountUp";

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
 */
export default function ReliabilityCard({ reliability, showPending = false, style }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (!reliability) return null;

  const { score, went = 0, missed = 0, pending = 0, label } = reliability;
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
          <Text style={styles.title}>Show-up rate</Text>
          <Text style={styles.label}>{label}</Text>
        </View>
      </View>

      <View style={styles.breakdown}>
        <Text style={[styles.chip, styles.chipWent]}>✓ {went} went</Text>
        <Text style={[styles.chip, styles.chipMissed]}>✕ {missed} missed</Text>
        {showPending && pending ? (
          <Text style={[styles.chip, styles.chipPending]}>⏳ {pending} to confirm</Text>
        ) : null}
      </View>
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
  scoreRow: { flexDirection: "row", alignItems: "flex-end", marginRight: 16 },
  // The em-dash case carries its own gap; inside scoreRow the row supplies it.
  score: { fontFamily: FONTS.accent, fontSize: 38, lineHeight: 40 },
  scoreEmpty: { marginRight: 16 },
  pct: { fontFamily: FONTS.accent, fontSize: 20, lineHeight: 28 },
  text: { flex: 1 },
  title: { fontFamily: FONTS.heading, fontSize: 15, color: t.text },
  label: { fontSize: 13, color: t.text2, marginTop: 1 },
  breakdown: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
    fontSize: 12,
    fontFamily: FONTS.bodySemi,
    backgroundColor: t.surface2,
    color: t.text2,
    overflow: "hidden",
  },
  chipWent: { color: t.status.good, backgroundColor: t.status.goodSoft },
  chipMissed: { color: t.status.bad, backgroundColor: t.status.badSoft },
  chipPending: { color: t.status.warn, backgroundColor: t.status.warnSoft },
});
