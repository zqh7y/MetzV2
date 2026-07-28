import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import TrustBadge from "./TrustBadge";
import TagChip from "./TagChip";
import AnimatedPressable from "./AnimatedPressable";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { CARD_ACCENTS, RADIUS, SHADOW } from "../styles/theme";

// Mirrors .meeting-card in static/style.css: a coloured accent rail, a type
// badge and relative time on top, then title, tags, description, and a footer
// holding the joined count and the Join button.
export default function MeetingCard({ meeting, index = 0, onPress, onJoin, onDelete }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isOnline = meeting.type === "OnlineMeeting";
  const rail = CARD_ACCENTS[index % CARD_ACCENTS.length];

  return (
    <AnimatedPressable style={styles.card} onPress={onPress} scaleTo={0.98}>
      <View style={[styles.accent, { backgroundColor: rail }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.badge, isOnline ? styles.badgeOnline : styles.badgeInPerson]}>
            {isOnline ? "🌐 Online" : "📍 In-Person"}
          </Text>
          <Text style={styles.time}>{meeting.time}</Text>
        </View>

        <Text style={styles.title}>{meeting.title}</Text>

        {meeting.creator_username ? (
          <View style={styles.creatorRow}>
            <Text style={styles.creator}>👤 {meeting.creator_username}</Text>
            {meeting.creator_is_trusted ? <TrustBadge /> : null}
          </View>
        ) : null}

        {meeting.tags && meeting.tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {meeting.tags.map((t) => (
              <TagChip key={t} label={t} />
            ))}
          </View>
        ) : null}

        <Text style={styles.desc} numberOfLines={2}>{meeting.description}</Text>

        {/* An online meeting's link is never printed on a card — the server
            only hands it to people who joined, and the detail screen decides
            whether the call is open yet. */}
        {isOnline ? (
          <Text style={styles.address}>🌐 Online</Text>
        ) : meeting.short_location ? (
          <Text style={styles.address}>📍 {meeting.short_location}</Text>
        ) : null}

        <View style={styles.footerRow}>
          <Text style={styles.joinedCount}>{meeting.joined_count || 0} joined</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.joinBtn, meeting.is_joined && styles.joinBtnActive]}
            onPress={onJoin}
          >
            <Text style={[styles.joinBtnText, meeting.is_joined && styles.joinBtnTextActive]}>
              {meeting.is_joined ? "Joined" : "Join"}
            </Text>
          </TouchableOpacity>
          {meeting.can_delete && onDelete ? (
            <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
              <Text style={styles.deleteBtnText}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </AnimatedPressable>
  );
}

const makeStyles = (t) => StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: t.surface,
    borderRadius: RADIUS.base,
    borderWidth: 1,
    borderColor: t.border,
    marginBottom: 12,
    overflow: "hidden",
    ...SHADOW.s1,
  },
  accent: { width: 5 },
  body: { flex: 1, padding: 12 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  badge: {
    fontSize: 10,
    fontFamily: FONTS.accent,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  badgeInPerson: { backgroundColor: t.accentSoft, color: t.accentStrong },
  badgeOnline: { backgroundColor: t.surface3, color: t.text2 },
  time: { fontSize: 11, color: t.text3, fontFamily: FONTS.accentMedium },
  title: { fontSize: 16, fontFamily: FONTS.heading, color: t.text, marginBottom: 4 },
  creatorRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  creator: { fontSize: 12, color: t.text2 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  desc: { fontSize: 13, color: t.text2, marginBottom: 6, lineHeight: 18 },
  address: { fontSize: 12, color: t.text3, marginBottom: 6 },
  footerRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  joinedCount: { fontSize: 12, color: t.text3, fontFamily: FONTS.accentMedium },
  joinBtn: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: t.accent,
  },
  joinBtnActive: { backgroundColor: t.surface3 },
  joinBtnText: { fontSize: 12, fontFamily: FONTS.accent, color: t.accentOn },
  joinBtnTextActive: { color: t.text2 },
  deleteBtn: { marginLeft: 8, padding: 6 },
  deleteBtnText: { color: t.status.bad, fontFamily: FONTS.accent },
});
