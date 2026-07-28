import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { api } from "../api";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";

export default function AdminPendingScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
        <ActivityIndicator size="large" color={theme.accent} />
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
        showsVerticalScrollIndicator={false}
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

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg, padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
  header: { fontSize: 20, fontFamily: FONTS.heading, color: t.text },
  subheader: { fontSize: 13, color: t.text2, marginBottom: 14 },
  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: 14,
    marginBottom: 12,
    ...SHADOW.s1,
  },
  title: { fontSize: 16, fontFamily: FONTS.heading, color: t.text },
  creator: { fontSize: 12, color: t.text2, marginTop: 2 },
  desc: { fontSize: 13, color: t.text2, marginTop: 6, lineHeight: 18 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  approveBtn: { flex: 1, backgroundColor: t.status.good, borderRadius: 11, paddingVertical: 10, alignItems: "center" },
  declineBtn: { flex: 1, backgroundColor: t.status.bad, borderRadius: 11, paddingVertical: 10, alignItems: "center" },
  btnText: { color: "#fff", fontFamily: FONTS.accent, fontSize: 13 },
  empty: { textAlign: "center", color: t.text3, marginTop: 60 },
});
