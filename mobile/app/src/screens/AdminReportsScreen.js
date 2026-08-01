import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../api";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";
import { formatWhen } from "../utils/time";

/**
 * The moderation queue.
 *
 * Reporting is only half a system: without somewhere for a human to read the
 * reports, flagging something writes to a table nobody opens. This is that
 * other half.
 *
 * Every report offers both the light action (dismiss it) and the heavy one
 * (remove the meeting, ban the account), because a queue that can only be
 * cleared without doing anything trains you to clear it without doing
 * anything.
 */
const TABS = [
  { id: "open", label: "Open" },
  { id: "actioned", label: "Actioned" },
  { id: "dismissed", label: "Dismissed" },
  { id: "", label: "All" },
];

export default function AdminReportsScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState("open");
  const [reports, setReports] = useState([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setFailed(false);
    api.getReports(tab)
      .then((data) => {
        setReports(data.reports || []);
        setOpenCount(data.open_count || 0);
      })
      .catch(() => setFailed(true))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const resolve = useCallback(async (report, action) => {
    setBusyId(report.id);
    try {
      const res = await api.resolveReport(report.id, action);
      setOpenCount(res.open_count ?? openCount);
      // Drop it from the list when the current tab no longer describes it.
      setReports((prev) => (tab && tab !== action ? prev.filter((r) => r.id !== report.id)
        : prev.map((r) => (r.id === report.id ? { ...r, status: action } : r))));
    } catch (e) {
      Alert.alert("Couldn't update", e.message || "Try again.");
    } finally {
      setBusyId(null);
    }
  }, [tab, openCount]);

  /**
   * Removing the thing and closing the report are one decision, so they are
   * one action — otherwise it is easy to delete a meeting and leave its report
   * sitting open, or close a report and leave the meeting up.
   */
  const takeAction = useCallback((report) => {
    const isMeeting = report.target_type === "meeting";
    Alert.alert(
      isMeeting ? "Remove this meeting?" : "Ban this account?",
      isMeeting
        ? "It disappears for everyone, and the report is marked actioned."
        : "They lose access immediately, and the report is marked actioned.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isMeeting ? "Remove" : "Ban",
          style: "destructive",
          onPress: async () => {
            setBusyId(report.id);
            try {
              if (isMeeting) await api.adminDeleteMeeting(report.target_id);
              else await api.banUser(report.target_id);
              await api.resolveReport(report.id, "actioned");
              load();
            } catch (e) {
              Alert.alert("Couldn't do that", e.message || "Try again.");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  }, [load]);

  const openTarget = useCallback((report) => {
    if (report.target_type === "user") {
      navigation.navigate("UserProfile", { uid: report.target_id });
    } else {
      // The queue only holds an id; the detail screen refetches everything it
      // needs, so a stub is enough to open it.
      navigation.navigate("MeetingDetail", {
        meeting: { id: Number(report.target_id), title: report.snapshot || "Meeting", type: "InPersonMeeting" },
      });
    }
  }, [navigation]);

  const renderReport = useCallback(({ item }) => {
    const isOpen = item.status === "open";
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.reasonPill, !isOpen && styles.reasonPillClosed]}>
            <Text style={[styles.reasonText, !isOpen && styles.reasonTextClosed]}>
              {item.reason_label}
            </Text>
          </View>
          <Text style={styles.kind}>{item.target_type === "user" ? "person" : "meeting"}</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.when}>{formatWhen(item.created_at)}</Text>
        </View>

        {/* Captured when the report was filed, so it survives the thing being
            deleted before anyone looks. */}
        {item.snapshot ? (
          <Text style={styles.snapshot} numberOfLines={3}>{item.snapshot}</Text>
        ) : (
          <Text style={styles.snapshotGone}>The reported content no longer exists.</Text>
        )}

        {item.detail ? <Text style={styles.detail}>“{item.detail}”</Text> : null}

        <Text style={styles.reporter}>Reported by {item.reporter_username}</Text>

        {!isOpen ? (
          <Text style={[styles.status, item.status === "actioned" && styles.statusActioned]}>
            {item.status === "actioned" ? "✓ Actioned" : "· Dismissed"}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={styles.ghost} onPress={() => openTarget(item)}>
            <Text style={styles.ghostText}>View</Text>
          </TouchableOpacity>

          {isOpen ? (
            <>
              <TouchableOpacity
                style={styles.ghost}
                onPress={() => resolve(item, "dismissed")}
                disabled={busyId === item.id}
              >
                <Text style={styles.ghostText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.danger}
                onPress={() => takeAction(item)}
                disabled={busyId === item.id}
              >
                {busyId === item.id
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.dangerText}>
                      {item.target_type === "user" ? "Ban" : "Remove"}
                    </Text>}
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    );
  }, [styles, busyId, openTarget, resolve, takeAction]);

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id || "all"}
              style={[styles.tab, tab === t.id && styles.tabActive]}
              onPress={() => { setLoading(true); setTab(t.id); }}
            >
              <Text style={[styles.tabText, tab === t.id && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.summary}>
          {openCount === 0 ? "Nothing waiting" : `${openCount} waiting on you`}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={theme.accent} /></View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderReport}
          contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {failed ? "Couldn't load reports." : tab === "open" ? "Queue is clear" : "Nothing here"}
              </Text>
              <Text style={styles.emptyBody}>
                {failed ? "Pull down to try again." : "Reports from the app show up here."}
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

  head: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  tabs: { flexDirection: "row", gap: 7 },
  tab: {
    borderRadius: RADIUS.pill, paddingHorizontal: 13, paddingVertical: 7,
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  tabActive: { backgroundColor: t.accent, borderColor: t.accent },
  tabText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: t.text2 },
  tabTextActive: { color: t.accentOn },
  summary: { fontSize: 12, color: t.text3, fontFamily: FONTS.accent, marginTop: 10 },

  card: {
    backgroundColor: t.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: t.border, padding: 14, marginBottom: 12, ...SHADOW.s1,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  reasonPill: {
    borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3,
    backgroundColor: t.status.badSoft,
  },
  reasonPillClosed: { backgroundColor: t.surface3 },
  reasonText: { fontSize: 11, fontFamily: FONTS.accent, color: t.status.bad },
  reasonTextClosed: { color: t.text3 },
  kind: { fontSize: 11, color: t.text3, fontFamily: FONTS.bodySemi },
  when: { fontSize: 11, color: t.text3 },

  snapshot: { fontSize: 14, color: t.text, marginTop: 10, lineHeight: 19 },
  snapshotGone: { fontSize: 13, color: t.text3, marginTop: 10, fontStyle: "italic" },
  detail: { fontSize: 13, color: t.text2, marginTop: 8, lineHeight: 18, fontStyle: "italic" },
  reporter: { fontSize: 11.5, color: t.text3, marginTop: 10 },
  status: { fontSize: 12, fontFamily: FONTS.accent, color: t.text3, marginTop: 6 },
  statusActioned: { color: t.status.good },

  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  ghost: {
    borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border,
  },
  ghostText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: t.text2 },
  danger: {
    borderRadius: RADIUS.pill, paddingHorizontal: 18, paddingVertical: 8,
    backgroundColor: t.status.bad, alignItems: "center", justifyContent: "center",
    minWidth: 78,
  },
  dangerText: { fontSize: 12.5, fontFamily: FONTS.accent, color: "#fff" },

  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 16, fontFamily: FONTS.heading, color: t.text },
  emptyBody: { fontSize: 13.5, color: t.text3, marginTop: 6, textAlign: "center" },
});
