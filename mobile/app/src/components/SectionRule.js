import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";

/**
 * The divider that introduces a run of cards in the Nearby list.
 *
 * The list is ordered by how far away a meeting is, so these headings are
 * labelling distance bands rather than categories: everything with a location
 * sorts above everything without one, and "Anywhere" is simply where meetings
 * with no distance end up. `note` carries the aside ("no travel needed") that
 * explains why the tail of the list stopped being sorted.
 */
function SectionRule({ Icon, label, count, note, tone = "near" }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const accent = tone === "far" ? theme.text3 : theme.accentStrong;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        {/* Stroke icon rather than emoji, so the heading takes its own colour
            instead of the system font's. */}
        {Icon ? <View style={styles.icon}><Icon size={14} color={accent} /></View> : null}
        <Text style={[styles.label, { color: accent }]}>{label}</Text>
        {typeof count === "number" ? (
          <View style={[styles.countPill, tone === "far" && styles.countPillFar]}>
            <Text style={[styles.count, tone === "far" && styles.countFar]}>{count}</Text>
          </View>
        ) : null}
        <View style={[styles.rule, { backgroundColor: theme.border }]} />
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

export default React.memo(SectionRule);

const makeStyles = (t) => StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 10 },
  headRow: { flexDirection: "row", alignItems: "center" },
  icon: { marginRight: 7 },
  label: {
    fontSize: 11.5,
    fontFamily: FONTS.accent,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  countPill: {
    marginLeft: 8,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: t.accentSoft,
  },
  countPillFar: { backgroundColor: t.surface3 },
  count: { fontSize: 11, fontFamily: FONTS.accent, color: t.accentStrong },
  countFar: { color: t.text3 },
  rule: { flex: 1, height: 1, marginLeft: 12 },
  note: { fontSize: 11, color: t.text3, marginTop: 4 },
});
