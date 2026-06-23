import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import MeetingCard from "../components/MeetingCard";
import { FONTS } from "../styles/fonts";

export default function JoinedScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { refreshProfile } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getJoined();
      setMeetings(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLeave(meeting) {
    await api.joinMeeting(meeting.id);
    load();
    refreshProfile();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.header}>🤝 My Joined Meetings</Text>
      <Text style={styles.subheader}>{meetings.length} meeting{meetings.length !== 1 ? "s" : ""}</Text>
      <FlatList
        data={meetings}
        keyExtractor={(m) => String(m.id)}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <MeetingCard
            meeting={item}
            onPress={() => navigation.navigate("MeetingDetail", { meeting: item })}
            onJoin={() => handleLeave(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🗓️</Text>
            <Text style={styles.empty}>No joined meetings yet — go discover some!</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5", paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { fontSize: 22, fontFamily: FONTS.heading, color: "#2c3e50" },
  subheader: { fontSize: 13, color: "#888", marginBottom: 16 },
  emptyBox: { alignItems: "center", marginTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  empty: { textAlign: "center", color: "#999", fontSize: 15 },
});
