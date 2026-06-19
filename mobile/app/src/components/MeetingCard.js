import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import TrustBadge from "./TrustBadge";
import TagChip from "./TagChip";

export default function MeetingCard({ meeting, onPress, onJoin, onDelete }) {
  const isOnline = meeting.type === "OnlineMeeting";

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.accent, { backgroundColor: isOnline ? "#764ba2" : "#667eea" }]} />
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

        {isOnline && meeting.link ? (
          <TouchableOpacity onPress={() => Linking.openURL(meeting.link)}>
            <Text style={styles.link}>🔗 Join meeting →</Text>
          </TouchableOpacity>
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  accent: { width: 5 },
  body: { flex: 1, padding: 12 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  badge: { fontSize: 10, fontWeight: "700", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, textTransform: "uppercase" },
  badgeInPerson: { backgroundColor: "#e8f4fd", color: "#2980b9" },
  badgeOnline: { backgroundColor: "#f0ebff", color: "#764ba2" },
  time: { fontSize: 11, color: "#999" },
  title: { fontSize: 16, fontWeight: "700", color: "#2c3e50", marginBottom: 4 },
  creatorRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  creator: { fontSize: 12, color: "#777" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 4 },
  desc: { fontSize: 13, color: "#777", marginBottom: 6 },
  link: { fontSize: 13, fontWeight: "700", color: "#3498db", marginBottom: 6 },
  address: { fontSize: 12, color: "#888", marginBottom: 6 },
  footerRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  joinedCount: { fontSize: 12, color: "#888", fontWeight: "600" },
  joinBtn: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: "#eef0ff" },
  joinBtnActive: { backgroundColor: "#667eea" },
  joinBtnText: { fontSize: 12, fontWeight: "700", color: "#667eea" },
  joinBtnTextActive: { color: "#fff" },
  deleteBtn: { marginLeft: 8, padding: 6 },
  deleteBtnText: { color: "#e74c3c", fontWeight: "700" },
});
