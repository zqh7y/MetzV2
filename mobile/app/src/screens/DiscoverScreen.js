import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TextInput, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import MeetingCard from "../components/MeetingCard";
import TrustBadge from "../components/TrustBadge";
import { FONTS } from "../styles/fonts";

export default function DiscoverScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { refreshProfile } = useAuth();
  const [tab, setTab] = useState("meetings");

  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getMeetings();
      setMeetings(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api.searchUsers(query).then(setUsers).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  async function handleJoin(meeting) {
    await api.joinMeeting(meeting.id);
    load();
    refreshProfile();
  }

  async function handlePass(meeting) {
    await api.passMeeting(meeting.id);
    setMeetings((prev) => prev.filter((m) => m.id !== meeting.id));
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <Text style={styles.header}>Discover</Text>
      <Text style={styles.subheader}>
        {tab === "meetings" ? "Tap Join to RSVP, or Pass to skip it" : "Find people by username, email, or ID"}
      </Text>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "meetings" && styles.tabActive]} onPress={() => setTab("meetings")}>
          <Text style={[styles.tabText, tab === "meetings" && styles.tabTextActive]}>Meetings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "people" && styles.tabActive]} onPress={() => setTab("people")}>
          <Text style={[styles.tabText, tab === "people" && styles.tabTextActive]}>People</Text>
        </TouchableOpacity>
      </View>

      {tab === "meetings" ? (
        loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#667eea" />
          </View>
        ) : (
          <FlatList
            data={meetings}
            keyExtractor={(m) => String(m.id)}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View>
                <MeetingCard
                  meeting={item}
                  onPress={() => navigation.navigate("MeetingDetail", { meeting: item })}
                  onJoin={() => handleJoin(item)}
                />
                <View style={styles.passRow}>
                  <Text style={styles.passLink} onPress={() => handlePass(item)}>✕ Not interested — pass</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>🎉 You're all caught up!</Text>}
            contentContainerStyle={{ paddingBottom: 24 }}
          />
        )
      ) : (
        <View style={{ flex: 1 }}>
          <TextInput
            style={styles.search}
            placeholder="Search by username, email, or ID…"
            placeholderTextColor="#9aa3ad"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {searching ? (
            <ActivityIndicator color="#667eea" style={{ marginTop: 16 }} />
          ) : (
            <FlatList
              data={users}
              keyExtractor={(u) => u.uid}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userRow}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate("UserProfile", { uid: item.uid })}
                >
                  <View style={[styles.userAvatar, { backgroundColor: item.color || "#667eea" }]}>
                    <Text style={styles.userAvatarText}>{item.username.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>{item.username}</Text>
                      {(item.is_trusted || item.is_admin) ? <TrustBadge /> : null}
                    </View>
                    <Text style={styles.userUid}>{item.uid}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>{query.trim() ? "No users found" : "Type to find users"}</Text>
              }
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5", padding: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { fontSize: 22, fontFamily: FONTS.heading, color: "#2c3e50" },
  subheader: { fontSize: 13, color: "#888", marginBottom: 14 },
  tabs: { flexDirection: "row", backgroundColor: "#e8eaed", borderRadius: 12, padding: 4, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: "center" },
  tabActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  tabText: { fontFamily: FONTS.bodySemi, color: "#888", fontSize: 13 },
  tabTextActive: { color: "#667eea" },
  passRow: { marginTop: -8, marginBottom: 8, alignItems: "center" },
  passLink: { color: "#e74c3c", fontSize: 12, fontWeight: "600" },
  empty: { textAlign: "center", color: "#999", marginTop: 60, fontSize: 15 },
  search: {
    backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 12, borderWidth: 1.5, borderColor: "#dce1e7", fontSize: 15,
  },
  userRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14,
    padding: 12, marginBottom: 10, gap: 12,
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  userAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  userAvatarText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  userName: { fontWeight: "700", color: "#2c3e50", fontSize: 14 },
  userUid: { fontSize: 11, color: "#aaa", marginTop: 2 },
  chevron: { fontSize: 20, color: "#ccc" },
});
