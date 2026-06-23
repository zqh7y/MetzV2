import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, TextInput, ActivityIndicator, RefreshControl } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import MeetingCard from "../components/MeetingCard";
import MapMarkerIcon from "../components/MapMarker";
import { FONTS } from "../styles/fonts";

const CENTER = { latitude: 31.7683, longitude: 35.2137, latitudeDelta: 0.4, longitudeDelta: 0.4 };

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
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
      <MapView style={StyleSheet.absoluteFill} initialRegion={CENTER}>
        {pins.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.title}
            description={m.short_location}
            onPress={() => navigation.navigate("MeetingDetail", { meeting: m })}
          >
            <MapMarkerIcon emoji={m.emoji} />
          </Marker>
        ))}
      </MapView>

      <View style={[styles.searchBar, { top: insets.top + 12 }]}>
        <TextInput
          style={styles.search}
          placeholder="Search meetings..."
          placeholderTextColor="#9aa3ad"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.panel}>
        <View style={styles.handle} />
        <Text style={styles.panelTitle}>Nearby Meetings</Text>
        <FlatList
          data={filtered}
          keyExtractor={(m) => String(m.id)}
          showsVerticalScrollIndicator={false}
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
  searchBar: { position: "absolute", left: 16, right: 16 },
  search: {
    backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  panel: {
    position: "absolute", left: 0, right: 0, bottom: 0, height: "46%",
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 10,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -4 },
    elevation: 10,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#dfe3e8", alignSelf: "center", marginBottom: 10 },
  panelTitle: { fontSize: 17, fontFamily: FONTS.heading, color: "#2c3e50", marginBottom: 10 },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
});
