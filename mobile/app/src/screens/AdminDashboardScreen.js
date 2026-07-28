import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { api } from "../api";
import TrustBadge from "../components/TrustBadge";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";
import { FONTS } from "../styles/fonts";

// The app half of the web's /admin/dashboard: same three tabs, same tiles,
// same actions. Numbers come from data.platform_stats() on the server, so this
// and the web dashboard can never disagree about the same database.
const TABS = ["overview", "users", "meetings"];

export default function AdminDashboardScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [data, setData] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    return api.getDashboard()
      .then(setData)
      .catch((e) => setError(e.message || "Couldn't load the dashboard."))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirm(title, message, onYes, destructive = true) {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: destructive ? "destructive" : "default", onPress: onYes },
    ]);
  }

  async function act(fn, failure) {
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert("That didn't work", e.message || failure);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || "Couldn't load the dashboard."}</Text>
        <Pressable style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const { stats, users, meetings } = data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor={theme.accent}
        />
      }
    >
      <Text style={styles.title}>🛠️ Developer Dashboard</Text>
      <Text style={styles.sub}>
        {stats.users.total} users · {stats.meetings.total} meetings · {stats.engagement.total_joins} joins
      </Text>

      <View style={styles.tabs}>
        {TABS.map((id) => {
          const active = tab === id;
          const count = id === "users" ? stats.users.total : id === "meetings" ? stats.meetings.total : null;
          return (
            <Pressable key={id} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(id)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {id[0].toUpperCase() + id.slice(1)}
                {count != null ? ` ${count}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === "overview" ? (
        <>
          {stats.engagement.pending_review > 0 ? (
            <Pressable style={styles.alert} onPress={() => navigation.navigate("AdminPending")}>
              <Text style={styles.alertText}>
                ⏳ {stats.engagement.pending_review} meeting
                {stats.engagement.pending_review === 1 ? "" : "s"} waiting for review
              </Text>
              <Text style={styles.alertChevron}>›</Text>
            </Pressable>
          ) : null}

          <View style={styles.tileGrid}>
            <Tile styles={styles} icon="👥" value={stats.users.total} label="Users" />
            <Tile styles={styles} icon="🟢" value={stats.users.online_now} label="Online now" />
            <Tile styles={styles} icon="✨" value={stats.users.new_7d} label="New this week" />
            <Tile styles={styles} icon="⭐" value={stats.users.trusted} label="Trusted" />
            <Tile styles={styles} icon="🛡️" value={stats.users.admins} label="Admins" />
            <Tile styles={styles} icon="🚫" value={stats.users.banned} label="Banned" />
            <Tile styles={styles} icon="📅" value={stats.meetings.total} label="Meetings" />
            <Tile styles={styles} icon="⏳" value={stats.meetings.pending} label="Pending" />
            <Tile styles={styles} icon="🤝" value={stats.engagement.total_joins} label="Joins" />
            <Tile styles={styles} icon="📊" value={stats.engagement.avg_per_meeting} label="Avg / meeting" />
          </View>

          <Card styles={styles} title="Meetings breakdown">
            <Bar styles={styles} label="Approved" value={stats.meetings.approved} total={stats.meetings.total} theme={theme} />
            <Bar styles={styles} label="Pending" value={stats.meetings.pending} total={stats.meetings.total} theme={theme} />
            <Bar styles={styles} label="In-person" value={stats.meetings.inperson} total={stats.meetings.total} theme={theme} />
            <Bar styles={styles} label="Online" value={stats.meetings.online} total={stats.meetings.total} theme={theme} />
          </Card>

          <Card styles={styles} title="Threshold meetings">
            <Bar styles={styles} label="Confirmed" value={stats.threshold.confirmed} total={stats.threshold.total} theme={theme} />
            <Bar styles={styles} label="Gathering" value={stats.threshold.gathering} total={stats.threshold.total} theme={theme} />
            <Bar styles={styles} label="Awaiting" value={stats.threshold.awaiting} total={stats.threshold.total} theme={theme} />
            <Bar styles={styles} label="Cancelled" value={stats.threshold.cancelled} total={stats.threshold.total} theme={theme} />
          </Card>

          {stats.top_organisers?.length ? (
            <Card styles={styles} title="Top organisers">
              {stats.top_organisers.map((o) => (
                <Pressable
                  key={o.uid}
                  style={styles.row}
                  onPress={() => navigation.navigate("UserProfile", { uid: o.uid })}
                >
                  <View style={[styles.avatar, { backgroundColor: o.color }]}>
                    <Text style={styles.avatarText}>{(o.name || o.uid).slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.rowName}>{o.name}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.rowMeta}>{o.created} created</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === "users" ? (
        <View style={styles.card}>
          {users.map((u) => (
            <View key={u.uid} style={styles.userBlock}>
              <Pressable style={styles.row} onPress={() => navigation.navigate("UserProfile", { uid: u.uid })}>
                <View style={[styles.avatar, { backgroundColor: u.color }]}>
                  <Text style={styles.avatarText}>{u.initial}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.rowName, u.is_banned && styles.banned]}>{u.username}</Text>
                    {u.is_admin ? <Text style={styles.adminTag}>admin</Text> : null}
                    {u.is_trusted && !u.is_admin ? <TrustBadge /> : null}
                    {u.is_banned ? <Text style={styles.bannedTag}>banned</Text> : null}
                  </View>
                  <Text style={styles.rowMeta}>
                    {u.email || u.uid} · {u.created} created · {u.joined} joined
                  </Text>
                </View>
              </Pressable>

              {/* Admins are protected server-side; hiding the buttons keeps the
                  UI honest about what will actually work. */}
              {!u.is_admin ? (
                <View style={styles.actions}>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => act(() => api.setTrust(u.uid), "Couldn't change trust.")}
                  >
                    <Text style={styles.actionText}>{u.is_trusted ? "Untrust" : "Trust"}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() =>
                      confirm(
                        u.is_banned ? "Unban user" : "Ban user",
                        `${u.username} will ${u.is_banned ? "regain" : "lose"} access.`,
                        () => act(() => api.banUser(u.uid), "Couldn't change ban.")
                      )
                    }
                  >
                    <Text style={styles.actionText}>{u.is_banned ? "Unban" : "Ban"}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.dangerBtn]}
                    onPress={() =>
                      confirm(
                        "Delete user",
                        `${u.username} and their account will be removed. This can't be undone.`,
                        () => act(() => api.deleteUser(u.uid), "Couldn't delete the user.")
                      )
                    }
                  >
                    <Text style={styles.dangerText}>Delete</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {tab === "meetings" ? (
        <View style={styles.card}>
          {meetings.map((m) => (
            <View key={m.id} style={styles.userBlock}>
              <Pressable style={styles.row} onPress={() => navigation.navigate("MeetingDetail", { meeting: m })}>
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.rowName} numberOfLines={1}>{m.title}</Text>
                    {m.status === "pending" ? <Text style={styles.pendingTag}>pending</Text> : null}
                  </View>
                  <Text style={styles.rowMeta}>
                    #{m.id} · {m.creator_username} · {m.time} · {m.joined_count} joined
                  </Text>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.actionBtn, styles.dangerBtn]}
                  onPress={() =>
                    confirm(
                      "Delete meeting",
                      `"${m.title}" will be removed for everyone.`,
                      () => act(() => api.adminDeleteMeeting(m.id), "Couldn't delete the meeting.")
                    )
                  }
                >
                  <Text style={styles.dangerText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Tile({ icon, value, label, styles }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileIcon}>{icon}</Text>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function Card({ title, children, styles }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Bar({ label, value, total, styles, theme }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: theme.accent }]} />
      </View>
      <Text style={styles.barValue}>{value}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg, padding: 24 },
  errorText: { color: t.text2, fontSize: 14, marginBottom: 14, textAlign: "center" },
  retry: { backgroundColor: t.accent, borderRadius: RADIUS.pill, paddingVertical: 10, paddingHorizontal: 24 },
  retryText: { color: t.accentOn, fontFamily: FONTS.accentMedium },

  title: { fontSize: 21, fontFamily: FONTS.heading, color: t.text },
  sub: { fontSize: 12.5, color: t.text3, marginTop: 3, marginBottom: 14 },

  tabs: { flexDirection: "row", backgroundColor: t.surface2, borderRadius: RADIUS.base, padding: 3, marginBottom: 14 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: RADIUS.base - 3 },
  tabActive: { backgroundColor: t.surface, ...SHADOW.s1 },
  tabText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: t.text3 },
  tabTextActive: { color: t.accentStrong },

  alert: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.accentSoft,
    borderWidth: 1,
    borderColor: t.accent,
    borderRadius: RADIUS.base,
    padding: 14,
    marginBottom: 14,
  },
  alertText: { flex: 1, color: t.accentStrong, fontFamily: FONTS.bodySemi, fontSize: 13.5 },
  alertChevron: { color: t.accentStrong, fontSize: 20 },

  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  tile: {
    width: "31%",
    flexGrow: 1,
    alignItems: "center",
    backgroundColor: t.surface,
    borderRadius: RADIUS.base,
    borderWidth: 1,
    borderColor: t.border,
    paddingVertical: 14,
  },
  tileIcon: { fontSize: 17 },
  tileValue: { fontSize: 20, fontFamily: FONTS.accent, color: t.text, marginTop: 4 },
  tileLabel: { fontSize: 10.5, color: t.text3, marginTop: 2, textAlign: "center" },

  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
    marginBottom: 14,
    ...SHADOW.s1,
  },
  cardTitle: { fontSize: 15, fontFamily: FONTS.heading, color: t.text, marginBottom: 12 },

  barRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 9 },
  barLabel: { width: 78, fontSize: 12, color: t.text2 },
  barTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: t.surface3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  barValue: { width: 28, textAlign: "right", fontSize: 12, fontFamily: FONTS.accentMedium, color: t.text2 },

  userBlock: { borderBottomWidth: 1, borderBottomColor: t.border, paddingVertical: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: FONTS.accent, fontSize: 13 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  rowName: { fontSize: 14, fontFamily: FONTS.bodySemi, color: t.text, flexShrink: 1 },
  rowMeta: { fontSize: 11.5, color: t.text3, marginTop: 2 },
  rowChevron: { fontSize: 20, color: t.text3 },
  banned: { textDecorationLine: "line-through" },

  adminTag: {
    fontSize: 10, fontFamily: FONTS.accent, color: t.accentOn, backgroundColor: t.accent,
    borderRadius: RADIUS.pill, paddingHorizontal: 7, paddingVertical: 2, overflow: "hidden",
  },
  bannedTag: {
    fontSize: 10, fontFamily: FONTS.accent, color: "#fff", backgroundColor: t.status.bad,
    borderRadius: RADIUS.pill, paddingHorizontal: 7, paddingVertical: 2, overflow: "hidden",
  },
  pendingTag: {
    fontSize: 10, fontFamily: FONTS.accent, color: t.text2, backgroundColor: t.surface3,
    borderRadius: RADIUS.pill, paddingHorizontal: 7, paddingVertical: 2, overflow: "hidden",
  },

  actions: { flexDirection: "row", gap: 8, marginTop: 9 },
  actionBtn: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: RADIUS.base,
    backgroundColor: t.surface2,
    borderWidth: 1,
    borderColor: t.border,
  },
  actionText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: t.text2 },
  dangerBtn: { borderColor: t.status.bad, backgroundColor: "rgba(231, 76, 60, 0.08)" },
  dangerText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: t.status.bad },
});
