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

        {/* Tags are whatever actually matches the current filters, so this row
            never offers a choice that leads nowhere. */}
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

        <View style={styles.metaRow}>
          <Text style={styles.count}>
            {loading ? "…" : `${rows.length} ${rows.length === 1 ? "meeting" : "meetings"}`}
          </Text>
          <TouchableOpacity onPress={() => setHideJoined((v) => !v)} hitSlop={8}>
            <Text style={[styles.toggle, hideJoined && styles.toggleOn]}>
              {hideJoined ? "☑" : "☐"}  Hide ones I've joined
            </Text>
          </TouchableOpacity>
        </View>
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
                  : "Try a wider time range, or clear a filter."}
              </Text>
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
  count: { fontSize: 12, fontFamily: FONTS.accent, color: t.text3 },
  toggle: { fontSize: 12, color: t.text3, fontFamily: FONTS.bodySemi },
  toggleOn: { color: t.accentStrong },

  empty: { alignItems: "center", paddingTop: 50, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontFamily: FONTS.heading, color: t.text },
  emptyBody: { fontSize: 13.5, color: t.text3, marginTop: 6, textAlign: "center" },
});
