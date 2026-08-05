import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../api";
import MeetingCard from "../components/MeetingCard";
import { SearchIcon } from "../components/NavIcons";
import useAutoRefresh from "../hooks/useAutoRefresh";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS } from "../styles/theme";

/**
 * The list view of every open meeting — a port of templates/explore.html.
 *
 * Home is a map, which answers "what is near me" and nothing else: you cannot
 * ask it for study sessions this week, or anything online. Filtering runs on
 * the server through the same explore_data() the web page calls, so a set of
 * filters means the same thing on both.
 */
const KINDS = [
  { id: "all", label: "All" },
  { id: "inperson", label: "In-Person" },
  { id: "online", label: "Online" },
];

const WHENS = [
  { id: "any", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

const SORTS = [
  { id: "soonest", label: "Soonest" },
  { id: "popular", label: "Popular" },
  { id: "newest", label: "Newest" },
];

/**
 * Explore rows carry `is_online` / `where`, while MeetingCard speaks the shape
 * the meetings endpoint returns. Translating here rather than branching inside
 * the card keeps one card component for the whole app.
 */
function toCard(row) {
  return {
    ...row,
    type: row.is_online ? "OnlineMeeting" : "InPersonMeeting",
    short_location: row.where,
  };
}

export default function ExploreScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [when, setWhen] = useState("any");
  const [sort, setSort] = useState("soonest");
  const [tag, setTag] = useState("");
  const [hideJoined, setHideJoined] = useState(false);

  const [rows, setRows] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const data = await api.getExplore({ q: search, kind, when, sort, tag, hide_joined: hideJoined });
      setRows(data.meetings || []);
      setAllTags(data.all_tags || []);
    } catch (e) {
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, kind, when, sort, tag, hideJoined]);

  // Filters re-query the server; the text box is debounced so typing does not
  // fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // Keeps the list current while it is open. skipFirstFocus because the effect
  // above already fetches on mount.
  useAutoRefresh(load, { intervalMs: 25000, skipFirstFocus: true });

  const openMeeting = useCallback((meeting) => {
    navigation.navigate("MeetingDetail", { meeting });
  }, [navigation]);

  const handleJoin = useCallback(async (meeting) => {
    // Flip locally first, then reconcile — same reasoning as Home: the request
    // is quick but a refetch plus re-render is not.
    setRows((prev) => prev.map((r) => (
      r.id === meeting.id
        ? { ...r, is_joined: !r.is_joined, joined_count: Math.max(0, (r.joined_count || 0) + (r.is_joined ? -1 : 1)) }
        : r
    )));
    try {
      await api.joinMeeting(meeting.id);
    } catch (e) {
      load();
    }
  }, [load]);

  const renderRow = useCallback(({ item, index }) => (
    <MeetingCard
      meeting={toCard(item)}
      index={index}
      onPress={openMeeting}
      onJoin={handleJoin}
    />
  ), [openMeeting, handleJoin]);

  // The four chip rows are collapsed by default: fully expanded they filled
  // most of a phone screen, so Explore opened on its own controls rather than
  // on anything to explore.
  const [showFilters, setShowFilters] = useState(false);

  /** Everything currently narrowing the list, each able to undo just itself. */
  const activeFilters = useMemo(() => {
    const out = [];
    if (kind !== "all") out.push({ key: "kind", label: KINDS.find((k) => k.id === kind)?.label, clear: () => setKind("all") });
    if (when !== "any") out.push({ key: "when", label: WHENS.find((w) => w.id === when)?.label, clear: () => setWhen("any") });
    if (sort !== "soonest") out.push({ key: "sort", label: SORTS.find((s) => s.id === sort)?.label, clear: () => setSort("soonest") });
    if (tag) out.push({ key: "tag", label: tag, clear: () => setTag("") });
    if (hideJoined) out.push({ key: "joined", label: "Not joined", clear: () => setHideJoined(false) });
    return out;
  }, [kind, when, sort, tag, hideJoined]);

  const clearAll = useCallback(() => {
    setKind("all");
    setWhen("any");
    setSort("soonest");
    setTag("");
    setHideJoined(false);
    setSearch("");
  }, []);

  /**
   * Open one of the current results at random.
   *
   * Deciding what to do is the actual problem this app has — the filters help
   * you narrow, and then you still have to choose. This picks for you, and it
   * respects the filters, so it is a shortcut rather than a lucky dip.
   */
  const surpriseMe = useCallback(() => {
    if (!rows.length) return;
    navigation.navigate("MeetingDetail", {
      meeting: toCard(rows[Math.floor(Math.random() * rows.length)]),
    });
  }, [rows, navigation]);

  const Chip = useCallback(({ active, label, onPress }) => (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  ), [styles]);

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <View style={styles.searchWrap}>
          <SearchIcon size={16} color={theme.text3} />
          <TextInput
            style={styles.search}
            placeholder="Search every meeting…"
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

        {/* One line, open or closed, so the list starts near the top. */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.controlBtn, (showFilters || activeFilters.length > 0) && styles.controlBtnOn]}
            onPress={() => setShowFilters((v) => !v)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.controlText,
                (showFilters || activeFilters.length > 0) && styles.controlTextOn,
              ]}
            >
              {`Filters${activeFilters.length ? ` · ${activeFilters.length}` : ""}  ${showFilters ? "▲" : "▼"}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlBtn, !rows.length && styles.controlBtnOff]}
            onPress={surpriseMe}
            disabled={!rows.length}
            activeOpacity={0.8}
          >
            <Text style={styles.controlText}>🎲  Surprise me</Text>
          </TouchableOpacity>

          <Text style={styles.count}>
            {loading ? "…" : `${rows.length} ${rows.length === 1 ? "meeting" : "meetings"}`}
          </Text>
        </View>

        {/* Closed, but filtered: show what is narrowing the list. Each chip
            removes only itself, so a filter can be seen and undone without
            reopening the panel to hunt for which row it came from. */}
        {!showFilters && activeFilters.length ? (
          <FlatList
            horizontal
            data={activeFilters}
            keyExtractor={(f) => f.key}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.activeChip} onPress={item.clear} activeOpacity={0.75}>
                <Text style={styles.activeChipText}>{item.label}  ✕</Text>
              </TouchableOpacity>
            )}
            ListFooterComponent={
              <TouchableOpacity onPress={clearAll} style={styles.clearAll} activeOpacity={0.7}>
                <Text style={styles.clearAllText}>Clear all</Text>
              </TouchableOpacity>
            }
          />
        ) : null}

        {showFilters ? (
          <View style={styles.panel}>
            <FlatList
              horizontal
              data={KINDS}
              keyExtractor={(k) => k.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              renderItem={({ item }) => (
                <Chip active={kind === item.id} label={item.label} onPress={() => setKind(item.id)} />
              )}
            />

            <FlatList
              horizontal
              data={WHENS}
              keyExtractor={(w) => w.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              renderItem={({ item }) => (
                <Chip active={when === item.id} label={item.label} onPress={() => setWhen(item.id)} />
              )}
            />

            <FlatList
              horizontal
              data={SORTS}
              keyExtractor={(s) => s.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              renderItem={({ item }) => (
                <Chip active={sort === item.id} label={item.label} onPress={() => setSort(item.id)} />
              )}
            />

            {/* Tags are whatever actually matches the current filters, so this
                row never offers a choice that leads nowhere. */}
            {allTags.length ? (
              <FlatList
                horizontal
                data={["", ...allTags]}
                keyExtractor={(t) => t || "any-tag"}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
                renderItem={({ item }) => (
                  <Chip
                    active={tag === item}
                    label={item || "Any tag"}
                    onPress={() => setTag(item)}
                  />
                )}
              />
            ) : null}

            <View style={styles.panelFoot}>
              <TouchableOpacity onPress={() => setHideJoined((v) => !v)} hitSlop={8}>
                <Text style={[styles.toggle, hideJoined && styles.toggleOn]}>
                  {hideJoined ? "☑" : "☐"}  Hide ones I've joined
                </Text>
              </TouchableOpacity>
              {activeFilters.length ? (
                <TouchableOpacity onPress={clearAll} hitSlop={8}>
                  <Text style={styles.clearAllText}>Clear all</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderRow}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {failed ? "Couldn't load Explore." : "Nothing matches that"}
              </Text>
              <Text style={styles.emptyBody}>
                {failed
                  ? "Pull down to try again."
                  : activeFilters.length
                    ? "Nothing fits all of those at once."
                    : "There is nothing open right now — try again later, or create one."}
              </Text>
              {/* Telling someone to clear a filter and making them go and find
                  it are different things. */}
              {!failed && activeFilters.length ? (
                <TouchableOpacity style={styles.emptyBtn} onPress={clearAll} activeOpacity={0.85}>
                  <Text style={styles.emptyBtnText}>Clear all filters</Text>
                </TouchableOpacity>
              ) : null}
              {!failed && !activeFilters.length ? (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => navigation.navigate("Create")}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyBtnText}>Create a meeting</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

  head: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: RADIUS.base,
    paddingHorizontal: 14,
  },
  search: { flex: 1, color: t.text, paddingVertical: 11, fontSize: 15, includeFontPadding: false },
  searchClear: { color: t.text3, fontSize: 13, paddingHorizontal: 2 },

  chipRow: { gap: 7, paddingVertical: 7 },
  chip: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  chipActive: { backgroundColor: t.accent, borderColor: t.accent },
  chipText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: t.text2 },
  chipTextActive: { color: t.accentOn },

  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: 4 },
  count: { fontSize: 12, fontFamily: FONTS.accent, color: t.text3, marginLeft: "auto" },
  toggle: { fontSize: 12, color: t.text3, fontFamily: FONTS.bodySemi },
  toggleOn: { color: t.accentStrong },

  controls: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  controlBtn: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: t.border, backgroundColor: t.surface,
  },
  controlBtnOn: { borderColor: t.accent, backgroundColor: t.accentSoft },
  controlBtnOff: { opacity: 0.45 },
  controlText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: t.text2 },
  controlTextOn: { color: t.accentStrong },

  panel: {
    marginTop: 4, paddingTop: 2,
    borderTopWidth: 1, borderTopColor: t.border,
  },
  panelFoot: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 4, marginBottom: 2,
  },

  // Removable summary of what is currently narrowing the list.
  activeChip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: RADIUS.pill,
    backgroundColor: t.accentSoft, borderWidth: 1, borderColor: t.accent,
  },
  activeChipText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: t.accentStrong },
  clearAll: { paddingHorizontal: 11, paddingVertical: 6, justifyContent: "center" },
  clearAllText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: t.text3, textDecorationLine: "underline" },

  empty: { alignItems: "center", paddingTop: 50, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontFamily: FONTS.heading, color: t.text },
  emptyBody: { fontSize: 13.5, color: t.text3, marginTop: 6, textAlign: "center", lineHeight: 19 },
  emptyBtn: {
    marginTop: 16, paddingHorizontal: 18, paddingVertical: 11,
    borderRadius: RADIUS.pill, backgroundColor: t.accent,
  },
  emptyBtnText: { color: t.accentOn, fontFamily: FONTS.headingSemi, fontSize: 13.5 },
});
