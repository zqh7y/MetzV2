import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TextInput, ActivityIndicator,
  RefreshControl, Animated, PanResponder, TouchableOpacity, Pressable, useWindowDimensions,
} from "react-native";
import WebMap from "../components/WebMap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { getSeenId } from "../adminSeen";
import { useAuth } from "../context/AuthContext";
import { faceSvg } from "../components/FaceAvatar";
import MeetingCard from "../components/MeetingCard";
import SectionRule from "../components/SectionRule";
import HostingPanel from "../components/HostingPanel";
import HomeDrawer, { MenuButton } from "../components/HomeDrawer";
import AccountSheet from "../components/AccountSheet";
import ExplorePane from "./ExploreScreen";
import { SearchIcon, MapPinIcon, GlobeIcon, CrosshairIcon } from "../components/NavIcons";
import { useLocation } from "../context/LocationContext";
import useAutoRefresh from "../hooks/useAutoRefresh";
import { distanceToMeeting, formatDistance } from "../utils/distance";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW, markerColorFor } from "../styles/theme";
import { useI18n } from "../context/LocaleContext";

const DEFAULT_CENTER = [35.2137, 31.7683]; // [lng, lat], the order WebMap takes
// Sheet height left visible at "peek" — enough to clear the tab bar and still
// show the title and search box above it.
const PEEK_VISIBLE = 215;

export default function HomeScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const { uid, profile, refreshProfile } = useAuth();
  const { theme, sheet: sheetPref, reduceMotion, comfortable } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme, comfortable), [theme, comfortable]);

  // Home has no bottom bar on the web either — the hamburger drawer replaced it
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountSheet, setAccountSheet] = useState(false);
  // The admin markers show unseen work, not outstanding work. The server sends
  // the newest id in each queue and adminSeen remembers the highest one already
  // shown, so opening a queue quiets its marker until something newer arrives —
  // instead of it staying red until every last item is actioned.
  const [seenPendingId, setSeenPendingId] = useState(0);
  const [seenReportId, setSeenReportId] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const uid = profile?.uid;
      if (!uid) return undefined;
      Promise.all([getSeenId(uid, "pending"), getSeenId(uid, "reports")])
        .then(([p, r]) => {
          if (!alive) return;
          setSeenPendingId(p);
          setSeenReportId(r);
        })
        .catch(() => {});
      return () => { alive = false; };
    }, [profile?.uid])
  );

  // An older API does not send the newest ids at all. Falling back to the plain
  // count keeps the marker visible in that case: hiding real moderation work
  // because the server is a version behind is the one failure worth avoiding.
  const unseen = (latestId, seenId, count) => {
    if (!count) return false;
    if (latestId === undefined || latestId === null) return true;
    return latestId > seenId;
  };
  const hasNewPending = unseen(
    profile?.latest_pending_id, seenPendingId, profile?.pending_review_count || 0
  );
  const hasNewReports = unseen(
    profile?.latest_report_id, seenReportId, profile?.open_report_count || 0
  );

  // Kept as the count so the drawer still says how many are waiting; it is the
  // decision to show anything at all that "seen" governs.
  const pendingCount = hasNewPending ? profile?.pending_review_count || 0 : 0;
  const reportCount = hasNewReports ? profile?.open_report_count || 0 : 0;

  /**
   * Which list the sheet is showing: the nearby one, or Explore's filters.
   *
   * Explore was a separate destination until the menu was cut to five, and it
   * and Home were always two views of the same meetings — the map sorts them
   * by how far away they are, Explore by anything else. They share the sheet
   * now, and the search box above it, so the choice is a tap rather than a
   * trip through the drawer.
   *
   * `route.params.tab` lets somewhere else ask for the Explore side directly;
   * Activity's "All clear" button is the one caller.
   */
  const [sheetTab, setSheetTab] = useState(route?.params?.tab === "explore" ? "explore" : "nearby");
  const onExplore = sheetTab === "explore";
  useEffect(() => {
    if (route?.params?.tab) setSheetTab(route.params.tab === "explore" ? "explore" : "nearby");
  }, [route?.params?.tab]);

  // The ids Explore last matched. Its rows carry no coordinates (explore_data()
  // in routes/explore.py does not return lat/lng), so they cannot be plotted
  // directly — the ids are intersected with `meetings`, which does have them,
  // and that narrowed set is what the map draws. A meeting Explore returns but
  // getMeetings() did not simply gets no pin, which is the honest outcome:
  // there is nowhere to put it.
  const [exploreIds, setExploreIds] = useState(null);
  // null means "stop narrowing" — Explore sends it when it switches to the
  // People tab, where there are no meetings for the pins to follow.
  const handleExploreResults = useCallback((rows) => {
    setExploreIds(rows ? new Set(rows.map((r) => r.id)) : null);
  }, []);

  // Which half of Explore is showing, so the shared search box can say what it
  // searches. Explore owns the toggle; this only mirrors it for the placeholder.
  const [exploreMode, setExploreMode] = useState("meetings");

  const [meetings, setMeetings] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  // Replaces a one-shot load on mount: meetings now appear without the user
  // closing and reopening the app. Refetches on focus, on returning from the
  // background, and every 20s while this screen is actually in front.
  useAutoRefresh(load, { intervalMs: 20000 });

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
  // What the pins should reflect is whatever list is actually on screen — a
  // filter that narrows the list to three meetings while the map still shows
  // forty makes the two disagree about what you are looking at.
  const plotSource = useMemo(() => {
    if (!onExplore || !exploreIds) return filtered;
    return meetings.filter((m) => exploreIds.has(m.id));
  }, [onExplore, exploreIds, filtered, meetings]);

  const plottable = useMemo(
    () => plotSource.filter((m) => m.lat && m.lng),
    [plotSource]
  );
  const markerKey = useMemo(
    () => plottable
      .map((m) => `${m.id}:${m.lat}:${m.lng}:${m.title}:${m.emoji || ""}:${m.is_online ? 1 : 0}`)
      .join("|"),
    [plottable]
  );
  // plottable is intentionally not a dependency — markerKey is what decides
  // whether anything a marker renders has moved.
  const stableMarkers = useMemo(() => plottable, [markerKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /**
   * Re-apply the saved panel position when it changes.
   *
   * It used to seed useState and nothing more, so it only took effect on a
   * cold start: change it in Settings, come back to Home, and the sheet was
   * still wherever it already was. Home is never unmounted between the two,
   * which is exactly why the setting looked like it did nothing.
   *
   * Skipped while the sheet is being dragged — snapping it out from under a
   * finger would be worse than ignoring the preference for a moment.
   */
  const lastPref = useRef(initialSheet);
  useEffect(() => {
    if (sheetPref === lastPref.current) return;
    lastPref.current = sheetPref;
    if (STATE_ORDER.includes(sheetPref)) snapTo(sheetPref);
  }, [sheetPref, snapTo]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // The sheet itself stays tall (so dragging never exposes a gap below it),
  // but the list viewport is sized to the strip that is actually on screen —
  // otherwise the end of the list would sit below the bottom of the display
  // and could never be scrolled to.
  // grabber + title row + search box + the Nearby/Explore tabs. Explore adds
  // its own filter bar below the tabs, so its list gets less again.
  const HEADER_BLOCK = 168;
  const EXPLORE_CONTROLS = 46;
  // Zoom and locate are controls *for the map*. Once the list is at full
  // height there is no map left to control, so they were floating over the
  // meeting list. Derived from the sheet's live position rather than from
  // sheetState, so they fade while it is being dragged instead of popping out
  // once it settles.
  const mapControlsOpacity = translateY.interpolate({
    inputRange: [tops.full, tops.half],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const listHeight = Math.max(
    140,
    screenH - tops[sheetState] - HEADER_BLOCK - (onExplore ? EXPLORE_CONTROLS : 0)
  );

  // ─── Map interaction ───────────────────────────────────────────────────
  const focusMeeting = useCallback((meeting) => {
    if (meeting.lat && meeting.lng) {
      snapTo("peek"); // otherwise the sheet covers the pin
      webMapRef.current?.flyTo({ center: [meeting.lng, meeting.lat], zoom: 15 });
    }
    navigation.navigate("MeetingDetail", { meeting });
  }, [snapTo, navigation]);

  // "You are here". The web draws the same marker with the user's avatar
  // colour and initial, so pass those through rather than a generic dot.
  // Shared with every meeting card — one watcher for the app, not one each.
  const myPosition = useLocation();

  /**
   * Tell the server which country this phone is in, once per session.
   *
   * The listing is filtered to the viewer's country, and the server can only
   * know that from coordinates the app reports — a bare API request carries no
   * location. Sent once and then remembered on the account, because the point
   * is that the listing still works the next time the app opens with location
   * switched off.
   *
   * Fires only when a fix actually arrives, so nothing is sent for someone who
   * declined the permission; their country stays unknown and they see
   * everything, which is the intended fallback.
   */
  const reportedCountry = useRef(false);
  useEffect(() => {
    if (!myPosition || reportedCountry.current) return;
    reportedCountry.current = true;
    api.updateProfile({ lat: myPosition.latitude, lng: myPosition.longitude })
      .then(() => refreshProfile())
      // Best effort: a failure here only means the listing stays unfiltered.
      .catch(() => {});
  }, [myPosition, refreshProfile]);

  // The camera follows the user until they drag the map away, which is the
  // same bargain every maps app makes: auto-centring is helpful right up to
  // the moment someone is deliberately looking somewhere else, and yanking
  // them back on the next GPS tick would make the map unusable. The locate
  // button below re-engages it.
  const [following, setFollowing] = useState(true);
  // Mirrors the camera so the +/- buttons have something to step from. The
  // WebView reports its real zoom back after every change, so this only has to
  // be right at startup.
  const zoomRef = useRef(11);
  const me = useMemo(() => {
    if (!myPosition) return null;
    const name = profile?.display_name || profile?.username || uid || "";
    return {
      lat: myPosition.latitude,
      lng: myPosition.longitude,
      color: profile?.profile_color,
      initial: name ? name.slice(0, 1).toUpperCase() : "",
      faceSvg: profile?.avatar_face ? faceSvg(profile.avatar_face) : null,
    };
  }, [myPosition, profile, uid]);

  const centreOnMe = useCallback((zoom) => {
    if (!myPosition) return;
    const next = zoom ?? Math.max(zoomRef.current, 14);
    zoomRef.current = next;
    webMapRef.current?.flyTo({
      center: [myPosition.longitude, myPosition.latitude],
      zoom: next,
    });
  }, [myPosition]);

  // Re-centres on every fix while following. watchPositionAsync only fires
  // after 25m of movement, so this is a handful of calls on a walk, not a
  // per-second fight with the camera.
  useEffect(() => {
    if (following) centreOnMe();
  }, [following, centreOnMe]);

  const handleLocate = useCallback(() => {
    // Pressing it while already following still recentres — after a pinch or a
    // small nudge that is exactly what the button is expected to do.
    setFollowing(true);
    centreOnMe();
  }, [centreOnMe]);

  // The map reads its own live zoom, so it takes the step rather than a target.
  const handleZoom = useCallback((delta) => {
    webMapRef.current?.zoomBy(delta);
  }, []);

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
        label: myPosition ? t("home.nearYou") : t("home.inPerson"),
        count: located.length,
        note: myPosition ? t("home.closestFirst") : t("home.turnOnLocationSort"),
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
        label: t("home.anywhere"),
        count: remote.length,
        note: t("home.noTravel"),
        tone: "far",
      });
      remote.forEach((m) => {
        out.push({ key: `m-${m.id}`, meeting: m, index: cardIndex++, distance: "" });
      });
    }

    return out;
  }, [filtered, myPosition, t]);

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
        emoji: m.emoji || "",
        color: markerColorFor(m.id),
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
        onUserPan={() => setFollowing(false)}
        onZoomChange={(z) => { zoomRef.current = z; }}
      />

      {/* Anchored to `end`, the opposite edge from the Metz pill, so the two
            never collide — including in Hebrew and Arabic where the pill moves
            to the right and this stack moves to the left. */}
        <Animated.View
          style={[styles.mapControls, { top: insets.top + 14, opacity: mapControlsOpacity }]}
          /* Opacity alone would leave invisible buttons swallowing taps over
             the list, so hit-testing is switched off at full height too. */
          pointerEvents={sheetState === "full" ? "none" : "box-none"}
        >
          <TouchableOpacity
            style={[styles.mapBtn, styles.mapBtnTop]}
            onPress={() => handleZoom(1)}
            accessibilityRole="button"
            accessibilityLabel={t("home.zoomIn")}
          >
            <Text style={styles.mapBtnText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapBtn, styles.mapBtnBottom]}
            onPress={() => handleZoom(-1)}
            accessibilityRole="button"
            accessibilityLabel={t("home.zoomOut")}
          >
            <Text style={styles.mapBtnText}>−</Text>
          </TouchableOpacity>

          {/* Filled while following, outlined once the map has been dragged
              away — the button doubles as the answer to "is this still me?" */}
          <TouchableOpacity
            style={[styles.mapBtn, styles.locateBtn, following && myPosition && styles.locateBtnOn]}
            onPress={handleLocate}
            disabled={!myPosition}
            accessibilityRole="button"
            accessibilityLabel={t("home.recenter")}
            accessibilityState={{ disabled: !myPosition, selected: following }}
          >
            <CrosshairIcon
              size={19}
              color={!myPosition ? theme.text3 : following ? theme.accentOn : theme.text}
            />
          </TouchableOpacity>
        </Animated.View>

      <MenuButton
        onPress={() => setMenuOpen(true)}
        showDot={!!profile?.is_admin && (pendingCount > 0 || reportCount > 0)}
      />

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
            <Text style={styles.panelTitle}>
              {onExplore ? t("nav.explore") : t("home.nearbyMeetings")}
            </Text>
            {/* The count is the answer to "is it worth opening this" — worth
                having in the header rather than only implied by the scrollbar.
                Explore prints its own count next to its filter button, where it
                can also say "…of 40"; this line would only repeat it. */}
            {onExplore ? null : (
              <Text style={styles.panelCount}>
                {filtered.length}{search.trim() ? t("home.ofTotal", { total: meetings.length }) : ""}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("Create")}>
            <Text style={styles.newBtnText}>{t("home.new")}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sheetBody}>
        <View style={styles.searchWrap}>
          <SearchIcon size={16} color={theme.text3} />
          <TextInput
            style={styles.search}
            /* One box for both tabs. Nearby filters the meetings already in
               hand as you type; Explore sends the same words to the server,
               debounced. Two boxes stacked in one sheet would have made you
               wonder which of them the list was obeying. */
            placeholder={
              !onExplore ? t("home.searchPlaceholder")
                : exploreMode === "people" ? t("profile.findPeoplePlaceholder")
                  : t("explore.searchPlaceholder")
            }
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

        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, !onExplore && styles.tabOn]}
            onPress={() => setSheetTab("nearby")}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, !onExplore && styles.tabTextOn]}>{t("home.tabNearby")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, onExplore && styles.tabOn]}
            onPress={() => setSheetTab("explore")}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, onExplore && styles.tabTextOn]}>{t("nav.explore")}</Text>
          </TouchableOpacity>
        </View>

        {onExplore ? (
          <ExplorePane
            navigation={navigation}
            search={search}
            listHeight={listHeight}
            onResults={handleExploreResults}
            onMode={setExploreMode}
          />
        ) : (
        <FlatList
          data={rows}
          style={{ height: listHeight }}
          keyExtractor={(row) => row.key}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          renderItem={renderRow}
          // Organisers get their own meetings above the nearby list — the
          // answer they gave in the intro decides whether this is here at all.
          // It renders nothing when they host nothing, so a new organiser is
          // not shown an empty box on their first launch.
          ListHeaderComponent={
            profile?.role === "organiser"
              ? <HostingPanel
                  onOpen={(m) => navigation.navigate("MeetingDetail", { meeting: m })}
                  onCreate={() => navigation.navigate("Create")}
                />
              : null
          }
          // Rows are cheap and the list is short, but these keep the sheet
          // responsive while it is being dragged: offscreen rows detach, and
          // the first paint stops at what actually fits.
          removeClippedSubviews
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          ListEmptyComponent={<Text style={styles.empty}>{t("home.noMatches")}</Text>}
          contentContainerStyle={{ paddingBottom: 24 + insets.bottom, rowGap: comfortable ? 8 : 0 }}
        />
        )}

        {/* Collapsed, the whole body is one big "open me".

            Only the grabber and the title did that before, so tapping a
            meeting you could already see — half of it cut off by the bottom of
            the screen — was simply ignored.

            Scoped to the body rather than the whole sheet so "+ New" stays
            reachable without opening the list first, and rendered only while
            collapsed, so at full height every control underneath behaves
            exactly as it did. */}
        {sheetState !== "full" ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => snapTo("full")}
            accessibilityRole="button"
            accessibilityLabel={t("home.openList")}
          />
        ) : null}
        </View>
      </Animated.View>

      {/* Last child, so it slides over the sheet as well as the map */}
      <HomeDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        navigation={navigation}
        activeRoute="Home"
        profile={profile}
        isAdmin={!!profile?.is_admin}
        pendingCount={pendingCount}
        activityCount={profile?.action_count || 0}
        inboxCount={profile?.unread_inbox_count || 0}
        reportCount={reportCount}
        onLogout={() => setAccountSheet(true)}
      />

      <AccountSheet visible={accountSheet} onClose={() => setAccountSheet(false)} />
    </View>
  );
}

// `comfortable` is the density preference: the web widens the sheet gutter and
// the search box at :root[data-density="comfortable"], and this matches it.
const makeStyles = (t, comfortable = false) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
  // The web's brand pill in the top-left of the map (see .home-menu-btn)
  // Zoom pair joined into one pill, locate button separate below it.
  mapControls: { position: "absolute", end: 16, zIndex: 6, alignItems: "center" },
  mapBtn: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.surface,
    ...SHADOW.s2,
  },
  mapBtnTop: {
    borderTopStartRadius: RADIUS.base,
    borderTopEndRadius: RADIUS.base,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  mapBtnBottom: { borderBottomStartRadius: RADIUS.base, borderBottomEndRadius: RADIUS.base },
  mapBtnText: {
    fontSize: t.fs(22),
    lineHeight: 26,
    color: t.text,
    fontFamily: FONTS.accentMedium,
    includeFontPadding: false,
  },
  locateBtn: { marginTop: 10, borderRadius: RADIUS.base },
  locateBtnOn: { backgroundColor: t.accent },

  titlePill: {
    position: "absolute",
    start: 16,
    backgroundColor: t.navBg,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 14,
    paddingVertical: 7,
    ...SHADOW.s2,
  },
  titlePillText: { color: "#fff", fontSize: t.fs(12), fontFamily: FONTS.accent },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: t.surface,
    borderTopStartRadius: 26,
    borderTopEndRadius: 26,
    paddingHorizontal: comfortable ? 22 : 16,
    shadowColor: "#101428",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 14,
  },
  // Density was a 6px change to one horizontal gutter, which nobody could see
  // — the setting says "how much fits on screen at once", and that is vertical
  // rhythm, not side padding. These are what a person actually notices.
  grabberArea: { paddingVertical: comfortable ? 14 : 10, alignItems: "center" },
  grabber: { width: 42, height: 5, borderRadius: 3, backgroundColor: t.surface3 },
  sheetBody: { flex: 1 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: comfortable ? 16 : 10 },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  panelTitle: { fontSize: t.fs(17), fontFamily: FONTS.heading, color: t.text },
  panelCount: {
    fontSize: t.fs(11),
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
  newBtnText: { color: t.accentOn, fontSize: t.fs(13), fontFamily: FONTS.accent },
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
    fontSize: t.fs(15),
    includeFontPadding: false,
  },
  searchClear: { color: t.text3, fontSize: t.fs(13), paddingHorizontal: 2 },

  // Nearby / Explore. A segmented control rather than two more rows in the
  // drawer: they are two orderings of one list, and the whole point of folding
  // Explore in here was to make that switch cost a tap.
  tabs: {
    flexDirection: "row",
    gap: 5,
    padding: 4,
    marginBottom: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: t.surface2,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: RADIUS.pill },
  tabOn: { backgroundColor: t.surface, ...SHADOW.s1 },
  tabText: { fontSize: t.fs(13.5), fontFamily: FONTS.bodySemi, color: t.text2 },
  tabTextOn: { color: t.accentStrong, fontFamily: FONTS.headingSemi },

  // Centred, not baseline-aligned: the title is a row (icon + text) rather than
  // a bare Text, and a View has no baseline to align the hint against.
  empty: { textAlign: "center", color: t.text3, marginTop: 40 },
});
