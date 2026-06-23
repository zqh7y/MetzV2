import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import TrustBadge from "../components/TrustBadge";
import TagChip from "../components/TagChip";
import { FONTS } from "../styles/fonts";

export default function MeetingDetailScreen({ route, navigation }) {
  const { meeting } = route.params;
  const { refreshProfile } = useAuth();
  const isOnline = meeting.type === "OnlineMeeting";

  async function handleJoin() {
    await api.joinMeeting(meeting.id);
    refreshProfile();
    navigation.goBack();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 18 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.badge}>{isOnline ? "🌐 Online" : "📍 In-Person"}</Text>
      <Text style={styles.title}>{meeting.title}</Text>

      <View style={styles.row}>
        <Text style={styles.creator}>👤 {meeting.creator_username}</Text>
        {meeting.creator_is_trusted ? <TrustBadge /> : null}
      </View>

      {meeting.tags && meeting.tags.length > 0 ? (
        <View style={styles.tagsRow}>
          {meeting.tags.map((t) => <TagChip key={t} label={t} />)}
        </View>
      ) : null}

      <Text style={styles.desc}>{meeting.description}</Text>
      <Text style={styles.time}>🕐 {meeting.time}</Text>

      {isOnline && meeting.link ? (
        <TouchableOpacity onPress={() => Linking.openURL(meeting.link)}>
          <Text style={styles.link}>🔗 Join meeting →</Text>
        </TouchableOpacity>
      ) : meeting.location ? (
        <Text style={styles.address}>📍 {meeting.location}</Text>
      ) : null}

      <Text style={styles.joinedCount}>{meeting.joined_count || 0} people joined</Text>

      <TouchableOpacity style={[styles.joinBtn, meeting.is_joined && styles.joinBtnActive]} onPress={handleJoin}>
        <Text style={[styles.joinBtnText, meeting.is_joined && styles.joinBtnTextActive]}>
          {meeting.is_joined ? "Leave Meeting" : "Join Meeting"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  badge: { fontSize: 11, fontWeight: "700", color: "#764ba2", backgroundColor: "#f0ebff", alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 },
  title: { fontSize: 22, fontFamily: FONTS.heading, color: "#2c3e50", marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  creator: { fontSize: 13, color: "#777" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  desc: { fontSize: 15, color: "#444", lineHeight: 21, marginBottom: 14 },
  time: { fontSize: 13, color: "#888", marginBottom: 8 },
  link: { fontSize: 14, fontWeight: "700", color: "#3498db", marginBottom: 8 },
  address: { fontSize: 13, color: "#888", marginBottom: 8 },
  joinedCount: { fontSize: 12, color: "#aaa", marginBottom: 18 },
  joinBtn: { backgroundColor: "#eef0ff", borderRadius: 24, paddingVertical: 14, alignItems: "center" },
  joinBtnActive: { backgroundColor: "#667eea" },
  joinBtnText: { fontWeight: "700", color: "#667eea" },
  joinBtnTextActive: { color: "#fff" },
});
