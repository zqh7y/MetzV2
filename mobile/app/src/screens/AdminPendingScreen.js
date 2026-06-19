import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { api } from "../api";

export default function AdminPendingScreen() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getPending();
      setMeetings(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(id) {
    await api.approveMeeting(id);
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleDecline(id) {
    await api.declineMeeting(id);
    setMeetings((prev) => prev.filter((m) => m.id !== id));
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>⏳ Pending Meetings</Text>
      <Text style={styles.subheader}>{meetings.length} awaiting review</Text>
      <FlatList
        data={meetings}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.creator}>👤 by {item.creator_username}</Text>
            <Text style={styles.desc}>{item.description}</Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(item.id)}>
                <Text style={styles.btnText}>✓ Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.declineBtn} onPress={() => handleDecline(item.id)}>
                <Text style={styles.btnText}>✕ Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>✅ Nothing pending right now.</Text>}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5", padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { fontSize: 20, fontWeight: "800", color: "#2c3e50" },
  subheader: { fontSize: 13, color: "#888", marginBottom: 14 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: "700", color: "#2c3e50" },
  creator: { fontSize: 12, color: "#777", marginTop: 2 },
  desc: { fontSize: 13, color: "#888", marginTop: 6 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  approveBtn: { flex: 1, backgroundColor: "#2ecc71", borderRadius: 8, paddingVertical: 9, alignItems: "center" },
  declineBtn: { flex: 1, backgroundColor: "#e74c3c", borderRadius: 8, paddingVertical: 9, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  empty: { textAlign: "center", color: "#999", marginTop: 60 },
});
