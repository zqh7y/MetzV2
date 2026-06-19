import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TextInput, ActivityIndicator, RefreshControl } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import MeetingCard from "../components/MeetingCard";

const CENTER = { latitude: 31.7683, longitude: 35.2137, latitudeDelta: 0.4, longitudeDelta: 0.4 };

export default function HomeScreen({ navigation }) {
  const { refreshProfile } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getMeetings();
      setMeetings(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleJoin(meeting) {
    await api.joinMeeting(meeting.id);
    load();
    refreshProfile();
  }

  const filtered = meetings.filter((m) => {
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const haystack = [m.title, m.description, m.location, m.link, m.creator_username, (m.tags || []).join(" ")]
      .join(" ")
      .toLowerCase();
    return words.every((w) => haystack.includes(w));
  });

  const pins = filtered.filter((m) => m.lat && m.lng);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={CENTER}>
        {pins.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.title}
            description={m.short_location}
          />
        ))}
      </MapView>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Nearby Meetings</Text>
        <TextInput
          style={styles.search}
          placeholder="Search meetings..."
          value={search}
          onChangeText={setSearch}
        />
        <FlatList
          data={filtered}
          keyExtractor={(m) => String(m.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => (
            <MeetingCard
              meeting={item}
              onPress={() => navigation.navigate("MeetingDetail", { meeting: item })}
              onJoin={() => handleJoin(item)}
            />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No meetings match your search.</Text>}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  map: { height: 220 },
  panel: { flex: 1, backgroundColor: "#fff", padding: 16, marginTop: -16, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  panelTitle: { fontSize: 17, fontWeight: "800", color: "#2c3e50", marginBottom: 10 },
  search: {
    backgroundColor: "#f8f9fa", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 12, borderWidth: 1, borderColor: "#e8eaed",
  },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
});
