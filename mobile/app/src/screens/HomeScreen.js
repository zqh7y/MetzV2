import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TextInput, ActivityIndicator,
  RefreshControl, Animated, PanResponder, TouchableOpacity, useWindowDimensions,
} from "react-native";
import { Map, Camera, GeoJSONSource, Layer, UserLocation, MAPS_AVAILABLE } from "../components/MapShim";
import WebMap from "../components/WebMap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import MeetingCard from "../components/MeetingCard";
import ForYouCard from "../components/ForYouCard";
import HomeDrawer, { MenuButton } from "../components/HomeDrawer";
import useMyLocation from "../hooks/useMyLocation";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";

const DEFAULT_CENTER = [35.2137, 31.7683]; // [lng, lat] — MapLibre order
// Reuse a fontstack the basemap already ships glyphs for, or labels don't draw.
const LABEL_FONT = ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular",
                    "HanWangHeiLight Regular", "NanumBarunGothic Regular"];
const FOR_YOU_LIMIT = 12;
// Sheet height left visible at "peek" — enough to clear the tab bar and still
// show the title and search box above it.
const PEEK_VISIBLE = 215;

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { uid, profile, refreshProfile, signOut } = useAuth();
  const { theme, sheet: sheetPref, reduceMotion, comfortable } = useTheme();
  const styles = useMemo(() => makeStyles(theme, comfortable), [theme, comfortable]);

  // Home has no bottom bar on the web either — the hamburger drawer replaced it
  const [menuOpen, setMenuOpen] = useState(false);
  const pendingCount = profile?.pending_review_count || 0;

  // Pins and clusters follow the accent, the way the web's refreshMapAccent()
  // recolours them when the accent preference changes.
  const clusterColor = useMemo(
    () => ["step", ["get", "point_count"], theme.accent, 10, theme.accentStrong, 30, theme.accentDeep],
    [theme]
  );

  const [meetings, setMeetings] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cameraRef = useRef(null);
  const sourceRef = useRef(null);
  const webMapRef = useRef(null);

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
  // Where the sheet sits when Home opens is a saved preference on the web
  // (data-sheet), so honour the same setting here instead of always peeking.
  const initialSheet = STATE_ORDER.includes(sheetPref) ? sheetPref : "peek";
  const [sheetState, setSheetState] = useState(initialSheet);
  const translateY = useRef(new Animated.Value(tops[initialSheet])).current;
  const currentTop = useRef(tops[initialSheet]);
  const dragStart = useRef(tops[initialSheet]);

  const snapTo = useCallback((state) => {
    const to = tops[state];
    currentTop.current = to;
    setSheetState(state);
    if (reduceMotion) {
      translateY.setValue(to);
      return;
    }
    Animated.spring(translateY, {
      toValue: to,
      useNativeDriver: true,
      bounciness: 2,
      speed: 14,
    }).start();
  }, [tops, translateY, reduceMotion]);

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
      const camera = MAPS_AVAILABLE ? cameraRef.current : webMapRef.current;
      camera?.flyTo({ center: [meeting.lng, meeting.lat], zoom: 15, duration: 900 });
    }
    navigation.navigate("MeetingDetail", { meeting });
  }

  // "You are here". The web draws the same marker with the user's avatar
  // colour and initial, so pass those through rather than a generic dot.
  const myPosition = useMyLocation();
  const me = useMemo(() => {
    if (!myPosition) return null;
    const name = profile?.display_name || profile?.username || uid || "";
    return {
      lat: myPosition.latitude,
      lng: myPosition.longitude,
      color: profile?.profile_color,
      initial: name ? name.slice(0, 1).toUpperCase() : "",
    };
  }, [myPosition, profile, uid]);

  // The WebView map takes a plain marker list rather than GeoJSON.
  const webMarkers = useMemo(
    () =>
      meetings
        .filter((m) => typeof m.lat === "number" && typeof m.lng === "number")
        .map((m) => ({
          id: m.id,
          lat: m.lat,
          lng: m.lng,
          title: m.title,
          kind: m.is_online ? "online" : "inperson",
        })),
    [meetings]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!MAPS_AVAILABLE ? (
        <WebMap
          ref={webMapRef}
          style={StyleSheet.absoluteFill}
          theme={theme}
          center={DEFAULT_CENTER}
          zoom={11}
          markers={webMarkers}
          me={me}
          onMarkerPress={(id) => {
            const meeting = meetings.find((m) => m.id === id);
            if (meeting) navigation.navigate("MeetingDetail", { meeting });
          }}
        />
      ) : (
      <Map style={StyleSheet.absoluteFill} mapStyle={theme.mapStyle} attribution compass logo={false}>
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
              "circle-color": clusterColor,
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
              "circle-color": clusterColor,
              "circle-radius": ["step", ["get", "point_count"], 18, 10, 23, 30, 28],
              "circle-stroke-width": 3,
              "circle-stroke-color": theme.surface,
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
            paint={{ "text-color": theme.accentOn }}
          />
          <Layer
            id="meeting-pins"
            type="circle"
            filter={["!", ["has", "point_count"]]}
            paint={{
              "circle-color": ["case", ["==", ["get", "kind"], "online"], theme.accentStrong, theme.accent],
              "circle-radius": 9,
              "circle-stroke-width": 3,
              "circle-stroke-color": theme.surface,
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
              "text-color": theme.mapLabel,
              "text-halo-color": theme.mapLabelHalo,
              "text-halo-width": 1.6,
            }}
          />
        </GeoJSONSource>
      </Map>
      )}

      <MenuButton onPress={() => setMenuOpen(true)} showDot={!!profile?.is_admin && pendingCount > 0} />

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
          placeholderTextColor={theme.text3}
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
          renderItem={({ item, index }) => (
            <MeetingCard
              meeting={item}
              index={index}
              onPress={() => focusMeeting(item)}
              onJoin={() => handleJoin(item)}
            />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No meetings match your search.</Text>}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
        />
      </Animated.View>

      {/* Last child, so it slides over the sheet as well as the map */}
      <HomeDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navigation={navigation}
        activeRoute="Home"
        isAdmin={!!profile?.is_admin}
        pendingCount={pendingCount}
        onLogout={signOut}
      />
    </View>
  );
}

// `comfortable` is the density preference: the web widens the sheet gutter and
// the search box at :root[data-density="comfortable"], and this matches it.
const makeStyles = (t, comfortable = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
  // The web's brand pill in the top-left of the map (see .home-menu-btn)
  titlePill: {
    position: "absolute",
    left: 16,
    backgroundColor: t.navBg,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    ...SHADOW.s2,
  },
  titlePillText: { color: "#fff", fontSize: 12, fontFamily: FONTS.accent },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: t.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: comfortable ? 22 : 16,
    shadowColor: "#101428",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 14,
  },
  grabberArea: { paddingVertical: 10, alignItems: "center" },
  grabber: { width: 42, height: 5, borderRadius: 3, backgroundColor: t.surface3 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  panelTitle: { fontSize: 17, fontFamily: FONTS.heading, color: t.text },
  // .create-btn-small: accent pill, not the old standalone green
  newBtn: {
    backgroundColor: t.accent,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  newBtnText: { color: t.accentOn, fontSize: 13, fontFamily: FONTS.accent },
  search: {
    backgroundColor: t.surface2,
    borderWidth: 1,
    borderColor: t.border,
    color: t.text,
    borderRadius: RADIUS.base,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 15,
    marginBottom: 12,
  },
  shelf: { marginBottom: 14 },
  shelfHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
  shelfTitle: { fontSize: 15, fontFamily: FONTS.heading, color: t.text },
  shelfHint: { fontSize: 11, color: t.text3, fontWeight: "600" },
  empty: { textAlign: "center", color: t.text3, marginTop: 40 },
});
