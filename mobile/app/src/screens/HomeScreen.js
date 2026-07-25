import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TextInput, ActivityIndicator,
  RefreshControl, Animated, PanResponder, TouchableOpacity, useWindowDimensions,
} from "react-native";
import { Map, Camera, GeoJSONSource, Layer, UserLocation } from "@maplibre/maplibre-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import MeetingCard from "../components/MeetingCard";
import ForYouCard from "../components/ForYouCard";
import { FONTS } from "../styles/fonts";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const DEFAULT_CENTER = [35.2137, 31.7683]; // [lng, lat] — MapLibre order
// Reuse a fontstack the basemap already ships glyphs for, or labels don't draw.
const LABEL_FONT = ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular",
                    "HanWangHeiLight Regular", "NanumBarunGothic Regular"];
const FOR_YOU_LIMIT = 12;
// Sheet height left visible at "peek" — enough to clear the tab bar and still
// show the title and search box above it.
const PEEK_VISIBLE = 215;
const CLUSTER_COLOR = ["step", ["get", "point_count"], "#667eea", 10, "#7b5fd6", 30, "#f5576c"];

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { uid, refreshProfile } = useAuth();

  const [meetings, setMeetings] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cameraRef = useRef(null);
  const sourceRef = useRef(null);

  // ─── Data ──────────────────────────────────────────────────────────────
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

  // Both actions mark the meeting as seen, so it drops off the shelf either way
  async function handlePass(meeting) {
    setMeetings((prev) => prev.map((m) => (m.id === meeting.id ? { ...m, is_seen: true } : m)));
    await api.passMeeting(meeting.id);
  }

  async function handleShelfJoin(meeting) {
    setMeetings((prev) => prev.map((m) => (m.id === meeting.id ? { ...m, is_seen: true } : m)));
    await api.joinMeeting(meeting.id);
    load();
    refreshProfile();
  }

  const filtered = useMemo(() => {
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return meetings;
    return meetings.filter((m) => {
      const haystack = [m.title, m.description, m.location, m.link, m.creator_username, (m.tags || []).join(" ")]
        .join(" ")
        .toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [meetings, search]);

  // "For You": everything not joined or passed yet, minus your own meetings
  const forYou = useMemo(
    () => meetings.filter((m) => !m.is_seen && m.creator_uid !== uid).slice(0, FOR_YOU_LIMIT),
    [meetings, uid]
  );

  const geojson = useMemo(() => ({
    type: "FeatureCollection",
    features: filtered
      .filter((m) => m.lat && m.lng)
      .map((m) => ({
        type: "Feature",
        id: m.id,
        properties: { id: m.id, title: m.title, kind: m.type === "OnlineMeeting" ? "online" : "inperson" },
        geometry: { type: "Point", coordinates: [m.lng, m.lat] },
      })),
  }), [filtered]);

  // ─── Bottom sheet ──────────────────────────────────────────────────────
  // Three snap points; the map stays full-screen behind and is told via camera
  // padding which slice of itself is actually visible.
  const tops = useMemo(() => ({
    full: screenH * 0.08,
    half: screenH * 0.45,
    peek: Math.max(screenH * 0.5, screenH - PEEK_VISIBLE),
  }), [screenH]);

  const STATE_ORDER = ["peek", "half", "full"];
  const [sheetState, setSheetState] = useState("peek");
  const translateY = useRef(new Animated.Value(tops.peek)).current;
  const currentTop = useRef(tops.peek);
  const dragStart = useRef(tops.peek);

  const snapTo = useCallback((state) => {
    const to = tops[state];
    currentTop.current = to;
    setSheetState(state);
    Animated.spring(translateY, {
      toValue: to,
      useNativeDriver: true,
      bounciness: 2,
      speed: 14,
    }).start();
  }, [tops, translateY]);

  // Keep the sheet honest if the window changes (rotation, split view)
  useEffect(() => {
    snapTo(sheetState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tops]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 3,
    onPanResponderGrant: () => { dragStart.current = currentTop.current; },
    onPanResponderMove: (_, g) => {
      const next = Math.min(tops.peek, Math.max(tops.full, dragStart.current + g.dy));
      translateY.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      const end = Math.min(tops.peek, Math.max(tops.full, dragStart.current + g.dy));
      if (Math.abs(g.dy) < 6) {
        // A tap, not a drag: step to the next size, wrapping at the top
        const i = STATE_ORDER.indexOf(sheetState);
        snapTo(STATE_ORDER[(i + 1) % STATE_ORDER.length]);
        return;
      }
      const nearest = STATE_ORDER.reduce((best, s) =>
        Math.abs(tops[s] - end) < Math.abs(tops[best] - end) ? s : best, sheetState);
      snapTo(nearest);
    },
  }), [tops, sheetState, snapTo, translateY]);

  const mapPadding = useMemo(() => ({
    top: 20,
    left: 20,
    right: 20,
    bottom: Math.min(screenH - tops[sheetState], screenH * 0.6),
  }), [screenH, tops, sheetState]);

  // The sheet itself stays tall (so dragging never exposes a gap below it),
  // but the list viewport is sized to the strip that is actually on screen —
  // otherwise the end of the list would sit below the bottom of the display
  // and could never be scrolled to.
  const HEADER_BLOCK = 122;   // grabber + title row + search box
  const listHeight = Math.max(140, screenH - tops[sheetState] - HEADER_BLOCK);

  // ─── Map interaction ───────────────────────────────────────────────────
  async function handlePinPress(event) {
    const feature = event?.nativeEvent?.features?.[0];
    if (!feature) return;

    if (feature.properties?.cluster) {
      const zoom = await sourceRef.current?.getClusterExpansionZoom(feature.properties.cluster_id);
      cameraRef.current?.easeTo({
        center: feature.geometry.coordinates,
        zoom: (zoom ?? 12) + 0.2,
        duration: 600,
      });
      return;
    }

    const meeting = meetings.find((m) => m.id === feature.properties?.id);
    if (meeting) navigation.navigate("MeetingDetail", { meeting });
  }

  function focusMeeting(meeting) {
    if (meeting.lat && meeting.lng) {
      snapTo("peek"); // otherwise the sheet covers the pin
      cameraRef.current?.flyTo({ center: [meeting.lng, meeting.lat], zoom: 15, duration: 900 });
    }
    navigation.navigate("MeetingDetail", { meeting });
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
      <Map style={StyleSheet.absoluteFill} mapStyle={MAP_STYLE} attribution compass logo={false}>
        <Camera
          ref={cameraRef}
          initialViewState={{ center: DEFAULT_CENTER, zoom: 11 }}
          padding={mapPadding}
        />
        <UserLocation animated />

        <GeoJSONSource
          id="meetings"
          ref={sourceRef}
          data={geojson}
          cluster
          clusterRadius={55}
          clusterMaxZoom={14}
          onPress={handlePinPress}
        >
          <Layer
            id="cluster-glow"
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": CLUSTER_COLOR,
              "circle-radius": ["step", ["get", "point_count"], 26, 10, 32, 30, 38],
              "circle-opacity": 0.25,
              "circle-blur": 0.6,
            }}
          />
          <Layer
            id="clusters"
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": CLUSTER_COLOR,
              "circle-radius": ["step", ["get", "point_count"], 18, 10, 23, 30, 28],
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={["has", "point_count"]}
            layout={{
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": LABEL_FONT,
              "text-size": 13,
            }}
            paint={{ "text-color": "#ffffff" }}
          />
          <Layer
            id="meeting-pins"
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": ["case", ["==", ["get", "kind"], "online"], "#00c2b8", "#6a4bc4"],
              "circle-radius": 9,
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff",
            }}
          />
          <Layer
            id="meeting-labels"
            type="symbol"
            filter={["!", ["has", "point_count"]]}
            layout={{
              "text-field": ["get", "title"],
              "text-font": LABEL_FONT,
              "text-size": 11.5,
              "text-anchor": "top",
              "text-offset": [0, 0.9],
              "text-max-width": 9,
              "text-optional": true,
            }}
            paint={{
              "text-color": "#3c4663",
              "text-halo-color": "rgba(255,255,255,0.92)",
              "text-halo-width": 1.6,
            }}
          />
        </GeoJSONSource>
      </Map>

      <View style={[styles.titlePill, { top: insets.top + 12 }]}>
        <Text style={styles.titlePillText}>📍  Explore Nearby</Text>
      </View>

      <Animated.View style={[styles.sheet, { height: screenH - tops.full, transform: [{ translateY }] }]}>
        <View style={styles.grabberArea} {...panResponder.panHandlers}>
          <View style={styles.grabber} />
        </View>

        <View style={styles.sheetHeader}>
          <Text style={styles.panelTitle}>Nearby Meetings</Text>
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("Create")}>
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.search}
          placeholder="Search meetings..."
          placeholderTextColor="#9aa3ad"
          value={search}
          onChangeText={setSearch}
        />

        <FlatList
          data={filtered}
          style={{ height: listHeight }}
          keyExtractor={(m) => String(m.id)}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListHeaderComponent={
            forYou.length ? (
              <View style={styles.shelf}>
                <View style={styles.shelfHead}>
                  <Text style={styles.shelfTitle}>✨ For You</Text>
                  <Text style={styles.shelfHint}>Not seen yet · {forYou.length} left</Text>
                </View>
                <FlatList
                  horizontal
                  data={forYou}
                  keyExtractor={(m) => `foryou-${m.id}`}
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item, index }) => (
                    <ForYouCard
                      meeting={item}
                      index={index}
                      onPress={() => focusMeeting(item)}
                      onJoin={() => handleShelfJoin(item)}
                      onPass={() => handlePass(item)}
                    />
                  )}
                />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <MeetingCard
              meeting={item}
              onPress={() => focusMeeting(item)}
              onJoin={() => handleJoin(item)}
            />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No meetings match your search.</Text>}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#eef1f5" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  titlePill: {
    position: "absolute",
    left: 16,
    backgroundColor: "rgba(28,28,46,0.72)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  titlePillText: { color: "#fff", fontSize: 12, fontFamily: FONTS.accent },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 14,
  },
  grabberArea: { paddingVertical: 10, alignItems: "center" },
  grabber: { width: 42, height: 5, borderRadius: 3, backgroundColor: "#d3d8e2" },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  panelTitle: { fontSize: 17, fontFamily: FONTS.heading, color: "#2c3e50" },
  newBtn: { backgroundColor: "#2ecc71", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  newBtnText: { color: "#fff", fontSize: 13, fontFamily: FONTS.accent },
  search: {
    backgroundColor: "#f5f6f8", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11,
    fontSize: 15, marginBottom: 12,
  },
  shelf: { marginBottom: 14 },
  shelfHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
  shelfTitle: { fontSize: 15, fontFamily: FONTS.heading, color: "#2c3e50" },
  shelfHint: { fontSize: 11, color: "#8b95a5", fontWeight: "600" },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
});
