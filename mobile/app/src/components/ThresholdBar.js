import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { formatWhen } from "../utils/time";

/**
 * "Only happens if enough people join" — the web's `.threshold` block.
 *
 * A meeting with a minimum is the one thing on a card a reader most needs to
 * know, because it decides whether joining means anything yet. The mobile card
 * was dropping it entirely, so a gathering meeting looked identical to a
 * confirmed one. The four states come straight from commit_status.
 */
export default function ThresholdBar({ meeting }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (!meeting?.has_threshold) return null;

  const status = meeting.commit_status;
  const joined = meeting.joined_count || 0;
  const min = meeting.min_attendees || 0;
  const progress = Math.max(0, Math.min(100, meeting.threshold_progress ?? 0));

  const label =
    status === "confirmed" ? "✅  Confirmed — it's happening"
    : status === "cancelled" ? "🚫  Called off"
    : status === "awaiting" ? "⏳  Deadline passed — organiser deciding"
    : `${joined} of ${min} needed`;

  const tone =
    status === "confirmed" ? theme.status.good
    : status === "cancelled" ? theme.status.bad
    : status === "awaiting" ? theme.status.warn
    : theme.text;

  // A full meeting still accepts joins, onto a waitlist — worth saying, since
  // the Join button looks the same either way.
  const full = meeting.spots_left === 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text style={[styles.label, { color: tone }]} numberOfLines={1}>{label}</Text>
        {meeting.join_deadline && status === "gathering" ? (
          <Text style={styles.deadline}>by {formatWhen(meeting.join_deadline)}</Text>
        ) : null}
      </View>

      <View style={styles.track}>
        <LinearGradient
          colors={[theme.accent, theme.accentStrong]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${progress}%` }]}
        />
      </View>

      {full ? (
        <Text style={styles.full}>
          Full — joining adds you to the waitlist
          {meeting.waitlist_count ? ` (${meeting.waitlist_count} waiting)` : ""}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: t.surface2,
    borderWidth: 1,
    borderColor: t.border,
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  label: { flex: 1, fontSize: 11.5, fontFamily: FONTS.accent },
  deadline: { fontSize: 10.5, fontFamily: FONTS.bodySemi, color: t.text3, marginLeft: 8 },
  track: { height: 6, borderRadius: 4, backgroundColor: t.surface3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4 },
  full: { fontSize: 10.5, color: t.status.warn, fontFamily: FONTS.bodySemi, marginTop: 6 },
});
