import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import SectionRule from "../components/SectionRule";
import HomeDrawer, { MenuButton } from "../components/HomeDrawer";
import { SearchIcon, SparkleIcon, MapPinIcon, GlobeIcon } from "../components/NavIcons";
import useMyLocation from "../hooks/useMyLocation";
import { distanceToMeeting, formatDistance } from "../utils/distance";
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

  /**
   * Join, and show it immediately.
   *
   * This used to await the request and then refetch every meeting before
   * anything on screen changed, so a tap sat dead for a round trip plus a full
   * list rebuild — the request itself is only a few milliseconds, so almost
   * all of that delay was self-inflicted. The row now flips first and the
   * network follows; if the server refuses, the change is rolled back.
   */
  const applyLocal = useCallback((id, patch) => {
    setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const handleJoin = useCallback(async (meeting) => {
    const joining = !meeting.is_joined;
    const before = { is_joined: meeting.is_joined, joined_count: meeting.joined_count };
    applyLocal(meeting.id, {
      is_joined: joining,
      joined_count: Math.max(0, (meeting.joined_count || 0) + (joining ? 1 : -1)),
    });
    try {
      await api.joinMeeting(meeting.id);
      // Reconcile in the background: the server may also have moved the
      // meeting's commit status now the count changed. Nothing awaits this,
      // so it never blocks the tap.
      load();
      refreshProfile();
    } catch (e) {
      applyLocal(meeting.id, before);
    }
  }, [applyLocal, load, refreshProfile]);

  // Both actions mark the meeting as seen, so it drops off the shelf either way
  const handlePass = useCallback(async (meeting) => {
    applyLocal(meeting.id, { is_seen: true });
    try {
      await api.passMeeting(meeting.id);
    } catch (e) {
      applyLocal(meeting.id, { is_seen: false });
    }
  }, [applyLocal]);

  const handleShelfJoin = useCallback(async (meeting) => {
    applyLocal(meeting.id, {
      is_seen: true,
      is_joined: true,
      joined_count: (meeting.joined_count || 0) + 1,
    });
    try {
      await api.joinMeeting(meeting.id);
      load();
      refreshProfile();
    } catch (e) {
      applyLocal(meeting.id, { is_seen: false, is_joined: false, joined_count: meeting.joined_count });
    }
  }, [applyLocal, load, refreshProfile]);

  // The box keeps `search` so every keystroke paints at once; the list filters
  // off the deferred copy, so a slow re-render lags a frame behind the caret
  // instead of blocking it.
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const words = deferredSearch.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return meetings;
    return meetings.filter((m) => {
      const haystack = [m.title, m.description, m.location, m.link, m.creator_username, (m.tags || []).join(" ")]
        .join(" ")
        .toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [meetings, deferredSearch]);

  // "For You": everything not joined or passed yet, minus your own meetings
  const forYou = useMemo(
    () => meetings.filter((m) => !m.is_seen && m.creator_uid !== uid).slice(0, FOR_YOU_LIMIT),
    [meetings, uid]
  );

  /**
   * What the map actually plots, and nothing else.
   *
   * Joining a meeting rewrites the `meetings` array, which used to hand both
   * map layers a brand-new list every time — so a single tap tore down and
   * rebuilt every pin, label and cluster on screen. None of what a marker
   * draws (position, title, kind) changes when you join, so the identity is
   * keyed to those fields: the arrays below are only rebuilt when something a
   * pin can actually show has changed.
   */
  const plottable = useMemo(
    () => filtered.filter((m) => m.lat && m.lng),
    [filtered]
  );
  const markerKey = useMemo(
    () => plottable.map((m) => `${m.id}:${m.lat}:${m.lng}:${m.title}:${m.is_online ? 1 : 0}`).join("|"),
    [plottable]
  );
  // plottable is intentionally not a dependency — markerKey is what decides
  // whether anything a marker renders has moved.
  const stableMarkers = useMemo(() => plottable, [markerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const geojson = useMemo(() => ({
    type: "FeatureCollection",
    features: stableMarkers.map((m) => ({
      type: "Feature",
      id: m.id,
      properties: { id: m.id, title: m.title, kind: m.type === "OnlineMeeting" ? "online" : "inperson" },
      geometry: { type: "Point", coordinates: [m.lng, m.lat] },
    })),
  }), [stableMarkers]);

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
        // A tap, not a drag. This used to step peek → half → full, which meant
        // two taps to read the list and a third to get back — so a tap now
        // goes straight to full, and taps again to dismiss. Dragging still
        // gives you the middle stop.
        snapTo(sheetState === "full" ? "peek" : "full");
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

  const focusMeeting = useCallback((meeting) => {
    if (meeting.lat && meeting.lng) {
      snapTo("peek"); // otherwise the sheet covers the pin
      const camera = MAPS_AVAILABLE ? cameraRef.current : webMapRef.current;
      camera?.flyTo({ center: [meeting.lng, meeting.lat], zoom: 15, duration: 900 });
    }
    navigation.navigate("MeetingDetail", { meeting });
  }, [snapTo, navigation]);

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

  // ─── Nearby list: ordered by distance, grouped by whether there is one ──
  // A meeting you can walk to is worth more than one three towns over, so the
  // list is sorted by how far away it is. Online meetings have no coordinates
  // (the API stores lat/lng null), so they can never earn a place in that
  // order — rather than let them fall silently to the bottom, they get their
  // own heading. This is the same Infinity-sorts-last rule the web uses in
  // sortMeetingsByDistance(), just made visible.
  const rows = useMemo(() => {
    const located = [];
    const remote = [];
    filtered.forEach((m) => {
      if (m.lat && m.lng) located.push(m);
      else remote.push(m);
    });

    // Without a fix there is no distance to sort by, so the original order
    // stands and the heading drops the "near you" claim it can't back up.
    if (myPosition) {
      located.sort((a, b) => distanceToMeeting(myPosition, a) - distanceToMeeting(myPosition, b));
    }

    const out = [];
    let cardIndex = 0;

    if (located.length) {
      out.push({
        key: "rule-near",
        rule: true,
        Icon: MapPinIcon,
        label: myPosition ? "Near you" : "In person",
        count: located.length,
        note: myPosition ? "Closest first" : "Turn on location to sort by distance",
        tone: "near",
      });
      located.forEach((m) => {
        const km = distanceToMeeting(myPosition, m);
        out.push({
          key: `m-${m.id}`,
          meeting: m,
          index: cardIndex++,
          distance: Number.isFinite(km) ? formatDistance(km) : "",
        });
      });
    }

    if (remote.length) {
      out.push({
        key: "rule-remote",
        rule: true,
        Icon: GlobeIcon,
        label: "Anywhere",
        count: remote.length,
        note: "No travel needed",
        tone: "far",
      });
      remote.forEach((m) => {
        out.push({ key: `m-${m.id}`, meeting: m, index: cardIndex++, distance: "" });
      });
    }

    return out;
  }, [filtered, myPosition]);

  // The WebView map takes a plain marker list rather than GeoJSON. Built from
  // the same stable set, so a join no longer re-injects setMarkers() and makes
  // Leaflet rebuild its whole cluster tree.
  const webMarkers = useMemo(
    () =>
      stableMarkers.map((m) => ({
        id: m.id,
        lat: m.lat,
        lng: m.lng,
        title: m.title,
        kind: m.is_online ? "online" : "inperson",
      })),
    [stableMarkers]
  );

  // Defined once rather than inline, so every row keeps the same function
  // identity between renders and the memo on MeetingCard actually holds.
  const renderRow = useCallback(({ item }) => (
    item.rule ? (
      <SectionRule
        Icon={item.Icon}
        label={item.label}
        count={item.count}
        note={item.note}
        tone={item.tone}
      />
    ) : (
      <MeetingCard
        meeting={item.meeting}
        index={item.index}
        distance={item.distance}
        onPress={focusMeeting}
        onJoin={handleJoin}
      />
    )
  ), [focusMeeting, handleJoin]);

  const renderShelfCard = useCallback(({ item, index }) => (
    <ForYouCard
      meeting={item}
      index={index}
      onPress={focusMeeting}
      onJoin={handleShelfJoin}
      onPass={handlePass}
    />
  ), [focusMeeting, handleShelfJoin, handlePass]);

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
          {/*
            The title is the tap target for opening the sheet, rather than the
            whole header row: a PanResponder over the row would claim the touch
            before "+ New" ever saw it.
          */}
          <TouchableOpacity
            style={styles.titleWrap}
            activeOpacity={0.6}
            onPress={() => snapTo(sheetState === "full" ? "peek" : "full")}
          >
            <Text style={styles.panelTitle}>Nearby Meetings</Text>
            {/* The count is the answer to "is it worth opening this" — worth
                having in the header rather than only implied by the scrollbar. */}
            <Text style={styles.panelCount}>
              {filtered.length}{search.trim() ? ` of ${meetings.length}` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("Create")}>
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <SearchIcon size={16} color={theme.text3} />
          <TextInput
            style={styles.search}
            placeholder="Search meetings…"
            placeholderTextColor={theme.text3}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={10}>
              <Text style={styles.searchClear}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <FlatList
          data={rows}
          style={{ height: listHeight }}
          keyExtractor={(row) => row.key}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListHeaderComponent={
            forYou.length ? (
              <View style={styles.shelf}>
                <View style={styles.shelfHead}>
                  <View style={styles.shelfTitleWrap}>
                    <SparkleIcon size={15} color={theme.accent} />
                    <Text style={styles.shelfTitle}>For You</Text>
                  </View>
                  <Text style={styles.shelfHint}>Not seen yet · {forYou.length} left</Text>
                </View>
                <FlatList
                  horizontal
                  data={forYou}
                  keyExtractor={(m) => `foryou-${m.id}`}
                  showsHorizontalScrollIndicator={false}
                  renderItem={renderShelfCard}
                  // Every card mounts a tile-fetching MiniMap, so only the
                  // ones near the viewport are worth building up front.
                  removeClippedSubviews
                  initialNumToRender={3}
                  maxToRenderPerBatch={3}
                  windowSize={5}
                />
              </View>
            ) : null
          }
          renderItem={renderRow}
          // Rows are cheap and the list is short, but these keep the sheet
          // responsive while it is being dragged: offscreen rows detach, and
          // the first paint stops at what actually fits.
          removeClippedSubviews
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          windowSize={7}
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
        activityCount={profile?.action_count || 0}
        inboxCount={profile?.unread_inbox_count || 0}
        reportCount={profile?.open_report_count || 0}
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
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  panelTitle: { fontSize: 17, fontFamily: FONTS.heading, color: t.text },
  panelCount: {
    fontSize: 11,
    fontFamily: FONTS.accent,
    color: t.text3,
    backgroundColor: t.surface2,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  // .create-btn-small: accent pill, not the old standalone green
  newBtn: {
    backgroundColor: t.accent,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  newBtnText: { color: t.accentOn, fontSize: 13, fontFamily: FONTS.accent },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: t.surface2,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: RADIUS.base,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  search: {
    flex: 1,
    color: t.text,
    paddingVertical: 11,
    fontSize: 15,
    includeFontPadding: false,
  },
  searchClear: { color: t.text3, fontSize: 13, paddingHorizontal: 2 },
  shelf: { marginBottom: 14 },
  // Centred, not baseline-aligned: the title is a row (icon + text) rather than
  // a bare Text, and a View has no baseline to align the hint against.
  shelfHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  shelfTitleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  shelfTitle: { fontSize: 15, fontFamily: FONTS.heading, color: t.text },
  shelfHint: { fontSize: 11, color: t.text3, fontWeight: "600" },
  empty: { textAlign: "center", color: t.text3, marginTop: 40 },
});
