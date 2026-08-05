import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Linking } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import TrustBadge from "../components/TrustBadge";
import ReliabilityCard from "../components/ReliabilityCard";
import MeetingCard from "../components/MeetingCard";
import Appear from "../components/Appear";
import CountUp from "../components/CountUp";
import AccountSheet from "../components/AccountSheet";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";

/** "2026-07-25 14:30" -> Date, or null if the server sent something odd. */
function parseTime(value) {
  if (!value) return null;
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function ProfileScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile, signOut } = useAuth();
  const [loading, setLoading] = useState(!profile);
  const [error, setError] = useState(false);
  const [accountSheet, setAccountSheet] = useState(false);

  // My Meetings — what the standalone Joined tab used to show
  const [joined, setJoined] = useState([]);
  const [joinedTab, setJoinedTab] = useState("upcoming");

  // Find People — what the Discover "People" tab used to show
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(() => {
    setError(false);
    refreshProfile()
      .then((p) => setError(!p))
      .finally(() => setLoading(false));
    // The shape is checked, not just the failure: a 200 carrying something
    // other than a list (a stub server, an error object serialised as JSON, a
    // proxy's response) still resolves, so .catch never runs — and `joined`
    // feeds .map below, which takes the whole screen down on anything else.
    api.getJoined()
      .then((list) => setJoined(Array.isArray(list) ? list : []))
      .catch(() => setJoined([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      api.searchUsers(query).then(setUsers).catch(() => setUsers([])).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const { upcoming, past } = useMemo(() => {
    const withTime = joined.map((m) => ({ meeting: m, at: parseTime(m.time) }));
    withTime.sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity));
    const now = Date.now();
    return {
      upcoming: withTime.filter((x) => x.at && x.at.getTime() >= now).map((x) => x.meeting),
      past: withTime.filter((x) => !x.at || x.at.getTime() < now).map((x) => x.meeting),
    };
  }, [joined]);

  async function handleLeave(meeting) {
    setJoined((prev) => prev.filter((m) => m.id !== meeting.id));
    await api.joinMeeting(meeting.id);   // same endpoint toggles off
    refreshProfile();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Couldn't load your profile.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = profile.account_status;
  const currentIndex = status.all_tiers.findIndex((t) => t.id === status.current.id);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <View style={[styles.hero, { paddingTop: insets.top + 28 }]}>
        <View style={styles.avatar}>
          <Text style={profile.avatar_emoji ? styles.avatarEmoji : styles.avatarText}>
            {profile.avatar_emoji || initialsFor(profile)}
          </Text>
        </View>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{profile.display_name || profile.username}</Text>
          {profile.is_trusted ? <TrustBadge /> : null}
        </View>
        <Text style={styles.email}>{profile.email}</Text>
        {/* The uid is how people find each other in Find People, so it belongs
            on the profile rather than only in search results. */}
        <Text style={styles.heroUid}>@{profile.uid}</Text>
        {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

        {/* Editing your profile used to be the fourth of six identical grey
            buttons at the very bottom, under Find People. It is the thing
            people come to their own profile to do, so it sits with the thing
            it edits. */}
        <View style={styles.heroActions}>
          <TouchableOpacity
            style={styles.heroBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("EditProfile")}
          >
            <Text style={styles.heroBtnText}>Edit profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroBtnGhost}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("Settings")}
          >
            <Text style={styles.heroBtnGhostText}>Settings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Blocks arrive a beat apart down the page, so the screen resolves in
          reading order rather than all at once. */}
      <Appear delay={40}>
        {/* Hairlines between the figures: four numbers spaced apart with
            nothing between them read as one run-on row. */}
        <View style={styles.statsRow}>
          <Stat styles={styles} number={profile.meetings_created} label="Created" />
          <View style={styles.statDivider} />
          <Stat styles={styles} number={profile.meetings_joined} label="Joined" />
          <View style={styles.statDivider} />
          <Stat styles={styles} number={profile.meetings_swiped} label="Seen" />
          <View style={styles.statDivider} />
          <Stat styles={styles} number={status.stats.participants} label="Signed Up" />
        </View>
      </Appear>

      {/* The number that makes a join mean something — above Account Status,
          in the same order profile.html puts them. */}
      <Appear delay={100}>
        <ReliabilityCard reliability={profile.reliability} showPending style={styles.reliability} />
      </Appear>

      <Appear delay={160}>
      <View style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <View style={styles.statusEmoji}>
            <Text style={{ fontSize: 22 }}>{status.current.emoji}</Text>
          </View>
          <View>
            <Text style={styles.statusLabel}>ACCOUNT STATUS</Text>
            <Text style={styles.statusName}>{status.current.name}</Text>
            <Text style={styles.statusBlurb}>{status.current.blurb}</Text>
          </View>
        </View>

        {status.next && status.next_is_manual ? (
          /* Trusted and Moderator are given by a person, not unlocked by a
             number. Showing a progress bar for them would promise that doing
             more of something eventually gets you there — so this says who to
             ask instead, and makes the address tappable. */
          <View style={styles.nextSection}>
            <Text style={styles.nextLabel}>
              Next up: {status.next.emoji} {status.next.name}
            </Text>
            <Text style={styles.manualHow}>{status.next_how}</Text>
            {status.contact_email ? (
              <TouchableOpacity
                style={styles.contactBtn}
                activeOpacity={0.85}
                onPress={() => Linking.openURL(
                  `mailto:${status.contact_email}?subject=${encodeURIComponent(
                    `Metz — ${status.next.name} request (${profile.uid})`
                  )}`
                )}
              >
                <Text style={styles.contactBtnText}>✉️  Contact the developer</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : status.next ? (
          <View style={styles.nextSection}>
            <Text style={styles.nextLabel}>
              Next up: {status.next.emoji} {status.next.name}
            </Text>
            {status.next_tasks.map((task, i) => (
              <View key={i} style={styles.task}>
                <View style={[styles.taskCheck, task.done && styles.taskCheckDone]}>
                  {task.done ? <Text style={styles.taskCheckMark}>✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.taskLabel, task.done && styles.taskLabelDone]}>{task.label}</Text>
                  <Text style={styles.taskProgress}>
                    {task.unit === "%"
                      ? `${task.progress}% of ${task.target}%`
                      : `${task.progress} / ${task.target}${task.unit ? " " + task.unit : ""}`}
                  </Text>
                  <View style={styles.taskBar}>
                    <View style={[styles.taskBarFill, { width: `${Math.min(100, (task.progress / task.target) * 100)}%` }]} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.maxed}>🏆 You've reached the top tier!</Text>
        )}

        <View style={styles.tierPills}>
          {status.all_tiers.map((t, i) => (
            <Text key={t.id} style={[styles.tierPill, i <= currentIndex && styles.tierPillUnlocked]}>
              {t.emoji} {t.name}
            </Text>
          ))}
        </View>
      </View>
      </Appear>

      {/* My Meetings — the old Joined tab, folded in here */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>🤝 My Meetings</Text>
          <View style={styles.segmented}>
            <TouchableOpacity
              style={[styles.segBtn, joinedTab === "upcoming" && styles.segBtnActive]}
              onPress={() => setJoinedTab("upcoming")}
            >
              <Text style={[styles.segText, joinedTab === "upcoming" && styles.segTextActive]}>
                Upcoming {upcoming.length}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segBtn, joinedTab === "past" && styles.segBtnActive]}
              onPress={() => setJoinedTab("past")}
            >
              <Text style={[styles.segText, joinedTab === "past" && styles.segTextActive]}>
                Past {past.length}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {(joinedTab === "upcoming" ? upcoming : past).length ? (
          (joinedTab === "upcoming" ? upcoming : past).map((m) => (
            <View key={m.id} style={joinedTab === "past" ? styles.pastCard : null}>
              <MeetingCard
                meeting={m}
                onPress={() => navigation.navigate("MeetingDetail", { meeting: m })}
                onJoin={() => handleLeave(m)}
              />
            </View>
          ))
        ) : (
          <Text style={styles.sectionEmpty}>
            {joinedTab === "upcoming"
              ? "Nothing coming up — check the For You picks on Home."
              : "No past meetings yet."}
          </Text>
        )}
      </View>

      {/* Find People — the old Discover "People" tab */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔍 Find People</Text>
        <TextInput
          style={styles.search}
          placeholder="Search by username, email, or ID…"
          placeholderTextColor={theme.text3}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        {searching ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 12 }} />
        ) : users.length ? (
          users.map((u) => (
            <TouchableOpacity
              key={u.uid}
              style={styles.userRow}
              activeOpacity={0.7}
              onPress={() => navigation.navigate("UserProfile", { uid: u.uid })}
            >
              <View style={[styles.userAvatar, { backgroundColor: u.color || "#667eea" }]}>
                <Text style={styles.userAvatarText}>{u.username.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.userNameRow}>
                  <Text style={styles.userName}>{u.username}</Text>
                  {(u.is_trusted || u.is_admin) ? <TrustBadge /> : null}
                </View>
                <Text style={styles.userUid}>{u.uid}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.sectionEmpty}>{query.trim() ? "No users found" : "Type to find users"}</Text>
        )}
      </View>

      <View style={styles.actions}>
        {profile.is_admin && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("AdminDashboard")}>
            <Text style={styles.actionBtnText}>🛠️  Developer Dashboard</Text>
          </TouchableOpacity>
        )}

        {profile.is_admin && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.urgentBtn]}
            onPress={() => navigation.navigate("AdminPending")}
          >
            <Text style={styles.urgentBtnText}>⏳ Review Pending Meetings</Text>
            {profile.pending_review_count > 0 ? (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{profile.pending_review_count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("Create")}>
          <Text style={styles.actionBtnText}>+ Create a Meeting</Text>
        </TouchableOpacity>

        {/* Edit profile and Settings now live in the hero, next to what they
            change, rather than repeating here. */}
        <TouchableOpacity style={[styles.actionBtn, styles.logoutBtn]} onPress={() => setAccountSheet(true)}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>
      <AccountSheet visible={accountSheet} onClose={() => setAccountSheet(false)} />
    </ScrollView>
  );
}

/**
 * Two letters for the avatar, taken from the person's name rather than their
 * uid. uid.slice(0, 2) only looked right when the uid happened to be derived
 * from the same name — for anyone else it showed two arbitrary letters.
 */
function initialsFor(profile) {
  const name = (profile.display_name || profile.username || "").trim();
  if (!name) return (profile.uid || "?").slice(0, 2).toUpperCase();
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function Stat({ number, label, styles }) {
  return (
    <View style={styles.stat}>
      <CountUp value={number} style={styles.statNumber} />
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: t.accent, paddingBottom: 26, alignItems: "center" },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
    // A ring lifts the avatar off the flat accent block behind it.
    borderWidth: 3, borderColor: "rgba(255,255,255,0.35)",
  },
  avatarText: { color: t.surface, fontFamily: FONTS.heading, fontSize: 28 },
  avatarEmoji: { fontSize: 40 },
  bio: { color: "rgba(255,255,255,0.88)", fontSize: 13.5, lineHeight: 19, marginTop: 10, textAlign: "center", paddingHorizontal: 32 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: t.surface, fontSize: 22, fontFamily: FONTS.heading },
  email: { color: "rgba(255,255,255,0.72)", fontSize: 12.5, marginTop: 3 },
  heroUid: { color: "rgba(255,255,255,0.55)", fontSize: 11.5, fontFamily: FONTS.accentMedium, marginTop: 2 },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  heroBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.pill,
    backgroundColor: t.surface,
  },
  heroBtnText: { color: t.accentStrong, fontFamily: FONTS.headingSemi, fontSize: 13.5 },
  heroBtnGhost: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
  },
  heroBtnGhostText: { color: t.surface, fontFamily: FONTS.headingSemi, fontSize: 13.5 },
  statsRow: {
    flexDirection: "row", backgroundColor: t.surface,
    marginHorizontal: 16, borderRadius: 16, paddingVertical: 16,
    justifyContent: "space-around", alignItems: "center",
    // Pulled up over the hero's bottom edge so the two read as one unit.
    marginTop: -18, marginBottom: 0,
    borderWidth: 1, borderColor: t.border, ...SHADOW.s1,
  },
  stat: { alignItems: "center", flex: 1 },
  statDivider: { width: 1, height: 26, backgroundColor: t.border },
  statNumber: { fontSize: 22, fontFamily: FONTS.accent, color: t.text },
  statLabel: { fontSize: 10, fontFamily: FONTS.bodySemi, color: t.text3, textTransform: "uppercase", marginTop: 2 },
  reliability: { marginHorizontal: 16, marginTop: 16 },
  statusCard: { backgroundColor: t.surface, margin: 16, borderRadius: 18, padding: 18 },
  statusHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  statusEmoji: { width: 46, height: 46, borderRadius: 14, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  statusLabel: { fontSize: 10, fontFamily: FONTS.bodySemi, color: t.text3, textTransform: "uppercase" },
  statusName: { fontSize: 17, fontFamily: FONTS.heading, color: t.text },
  statusBlurb: { fontSize: 11, color: t.text3 },
  nextSection: { borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12 },
  nextLabel: { fontSize: 12, fontWeight: "700", color: t.text2, marginBottom: 8 },
  task: { flexDirection: "row", gap: 10, paddingVertical: 6, alignItems: "flex-start" },
  taskCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: t.border, alignItems: "center", justifyContent: "center", marginTop: 2 },
  taskCheckDone: { backgroundColor: t.status.good, borderColor: t.status.good },
  taskCheckMark: { color: t.surface, fontSize: 10, fontWeight: "800" },
  taskLabel: { fontSize: 13, fontWeight: "600", color: t.text2 },
  taskLabelDone: { color: t.status.good },
  taskProgress: { fontSize: 11, color: t.text3, marginTop: 1 },
  manualHow: { fontSize: 13, color: t.text2, lineHeight: 19, marginTop: 2, marginBottom: 12 },
  contactBtn: {
    alignSelf: "flex-start", paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: RADIUS.pill, backgroundColor: t.accentSoft,
    borderWidth: 1, borderColor: t.accent,
  },
  contactBtnText: { fontSize: 13, fontFamily: FONTS.headingSemi, color: t.accentStrong },
  taskBar: { height: 5, borderRadius: 3, backgroundColor: t.border, marginTop: 4, overflow: "hidden" },
  taskBarFill: { height: "100%", backgroundColor: t.accent },
  maxed: { textAlign: "center", color: t.text3, fontSize: 13 },
  tierPills: { flexDirection: "row", flexWrap: "wrap", gap: 6, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 12, marginTop: 4 },
  tierPill: { fontSize: 10, fontWeight: "700", color: t.text3, backgroundColor: t.surface2, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  tierPillUnlocked: { color: t.accent, backgroundColor: "rgba(102,126,234,0.12)" },
  section: { backgroundColor: t.surface, marginHorizontal: 16, marginTop: 16, borderRadius: 18, padding: 16 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 },
  sectionTitle: { fontSize: 15, fontFamily: FONTS.heading, color: t.text, marginBottom: 10 },
  sectionEmpty: { color: t.text3, fontSize: 13, textAlign: "center", paddingVertical: 14 },
  segmented: { flexDirection: "row", backgroundColor: t.surface2, borderRadius: 12, padding: 3 },
  segBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  segBtnActive: { backgroundColor: t.surface, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  segText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: t.text3 },
  segTextActive: { color: t.text },
  pastCard: { opacity: 0.62 },
  search: {
    backgroundColor: t.surface2, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, marginBottom: 12,
  },
  userRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: t.surface2, borderRadius: 14,
    padding: 12, marginBottom: 10, gap: 12,
  },
  userAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  userAvatarText: { color: t.surface, fontWeight: "800", fontSize: 13 },
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  userName: { fontWeight: "700", color: t.text, fontSize: 14 },
  userUid: { fontSize: 11, color: t.text3, marginTop: 2 },
  chevron: { fontSize: 20, color: t.text3 },
  actions: { padding: 16, gap: 10 },
  actionBtn: { backgroundColor: t.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18 },
  actionBtnText: { fontFamily: FONTS.accentMedium, color: t.text, fontSize: 14 },
  urgentBtn: { backgroundColor: t.status.bad, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  urgentBtnText: { fontFamily: FONTS.accentMedium, color: t.surface, fontSize: 14 },
  pendingBadge: { backgroundColor: t.surface, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pendingBadgeText: { color: t.status.bad, fontFamily: FONTS.accent, fontSize: 12 },
  logoutBtn: {},
  logoutBtnText: { fontFamily: FONTS.accentMedium, color: t.status.bad, fontSize: 14 },
  errorText: { color: t.text2, fontSize: 14, marginBottom: 14 },
  retryBtn: { backgroundColor: t.accent, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24 },
  retryBtnText: { color: t.surface, fontFamily: FONTS.accentMedium },
});
