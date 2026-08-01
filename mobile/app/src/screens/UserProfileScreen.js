import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import TrustBadge from "../components/TrustBadge";
import ReliabilityCard from "../components/ReliabilityCard";
import ReportSheet from "../components/ReportSheet";
import Appear from "../components/Appear";
import CountUp from "../components/CountUp";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";

// Convert the UTC timestamp from the API into a date and time people can read.
function formatProfileTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString(undefined, {
    day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function UserProfileScreen({ route }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { uid } = route.params;
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // Looking at your own profile through search shouldn't offer to block you.
  const isSelf = profile?.uid === uid;

  useEffect(() => {
    api.getBlocked()
      .then((list) => setBlocked(list.some((b) => b.uid === uid)))
      .catch(() => {});
  }, [uid]);

  function confirmBlock() {
    if (blocked) {
      Alert.alert("Unblock?", "Their meetings will show up again.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: () => api.unblockUser(uid).then(() => setBlocked(false)).catch(() => {}),
        },
      ]);
      return;
    }
    Alert.alert(
      "Block this person?",
      "You won't see meetings they create. They aren't told, and you can undo it here.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => api.blockUser(uid).then(() => setBlocked(true)).catch(() => {}),
        },
      ]
    );
  }

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const data = await api.getUser(uid);
      setUser(data);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [uid]);

  async function handleToggleTrust() {
    await api.toggleTrust(uid);
    load();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (error || !user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Couldn't load this profile.</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = user.account_status;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <View style={[styles.avatar, { backgroundColor: user.profile_color || "#667eea" }]}>
          <Text style={styles.avatarText}>{user.username.slice(0, 2).toUpperCase()}</Text>
        </View>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user.username}</Text>
          {user.is_trusted ? <TrustBadge /> : null}
        </View>
        <Text style={styles.uid}>@{user.uid}</Text>

        {profile?.is_admin ? (
          <TouchableOpacity style={styles.trustBtn} onPress={handleToggleTrust} activeOpacity={0.85}>
            <Text style={styles.trustBtnText}>{user.is_trusted ? "★ Remove Trusted Status" : "☆ Mark as Trusted"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* No "to confirm" chip here: user_profile.html prints only the settled
          counts, because someone else's unanswered meetings are not the
          viewer's business. */}
      <Appear delay={40}>
        <ReliabilityCard reliability={user.reliability} style={styles.reliability} />
      </Appear>

      {status ? (
        <Appear delay={100}>
        <View style={styles.statusCard}>
          <View style={styles.statusEmoji}>
            <Text style={{ fontSize: 22 }}>{status.current.emoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusLabel}>ACCOUNT STATUS</Text>
            <Text style={styles.statusName}>{status.current.name}</Text>
            <Text style={styles.statusBlurb}>{status.current.blurb}</Text>
          </View>
        </View>
        </Appear>
      ) : null}

      <Appear delay={160}>
        <View style={styles.statsRow}>
          <Stat styles={styles} number={user.meetings_created} label="Created" />
          <View style={styles.statDivider} />
          <Stat styles={styles} number={user.meetings_joined} label="Joined" />
          <View style={styles.statDivider} />
          <Stat styles={styles} number={user.meetings_swiped} label="Swiped" />
        </View>
      </Appear>

      <Appear delay={220}>
      <View style={styles.activity}>
        <View style={styles.activityRow}>
          <Text style={styles.activityIcon}>📅</Text>
          <View>
            <Text style={styles.activityLabel}>Member since</Text>
            <Text style={styles.activityValue}>{formatProfileTime(user.joined_at)}</Text>
          </View>
        </View>
        <View style={styles.activityRow}>
          <Text style={styles.activityIcon}>🟢</Text>
          <View>
            <Text style={styles.activityLabel}>Last online</Text>
            <Text style={styles.activityValue}>{formatProfileTime(user.last_online)}</Text>
          </View>
        </View>
      </View>
      </Appear>

      {/* Blocking is the one that works immediately and needs no moderator, so
          it sits alongside reporting rather than behind it. */}
      {!isSelf ? (
        <View style={styles.safety}>
          <TouchableOpacity style={styles.safetyBtn} onPress={() => setReporting(true)}>
            <Text style={styles.safetyText}>⚑  Report this person</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.safetyBtn} onPress={confirmBlock}>
            <Text style={[styles.safetyText, blocked && styles.safetyTextOn]}>
              {blocked ? "✓  Blocked — tap to undo" : "⃠  Block this person"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ReportSheet
        visible={reporting}
        onClose={() => setReporting(false)}
        targetType="user"
        targetId={uid}
        targetLabel={user.username}
      />
    </ScrollView>
  );
}

function Stat({ number, label, styles }) {
  return (
    <View style={styles.stat}>
      <CountUp value={number ?? 0} style={styles.statNumber} />
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { alignItems: "center", padding: 24 },
  avatar: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  avatarText: { color: t.surface, fontFamily: FONTS.heading, fontSize: 24 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 20, fontFamily: FONTS.heading, color: t.text },
  uid: { fontSize: 12, color: t.text3, marginTop: 4, marginBottom: 16 },
  trustBtn: { backgroundColor: t.accent, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 24 },
  trustBtnText: { color: t.surface, fontFamily: FONTS.accentMedium },
  reliability: { marginHorizontal: 16, marginBottom: 14 },
  statusCard: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: t.surface,
    marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statusEmoji: { width: 46, height: 46, borderRadius: 14, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  statusLabel: { fontSize: 10, fontFamily: FONTS.bodySemi, color: t.text3, textTransform: "uppercase" },
  statusName: { fontSize: 17, fontFamily: FONTS.heading, color: t.text },
  statusBlurb: { fontSize: 11, color: t.text3 },
  statsRow: {
    flexDirection: "row", backgroundColor: t.surface, marginHorizontal: 16, borderRadius: 16,
    padding: 16, justifyContent: "space-around", alignItems: "center", marginBottom: 14,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  stat: { alignItems: "center", flex: 1 },
  statDivider: { width: 1, height: 30, backgroundColor: t.border },
  statNumber: { fontSize: 20, fontFamily: FONTS.accent, color: t.text },
  statLabel: { fontSize: 10, fontFamily: FONTS.bodySemi, color: t.text3, textTransform: "uppercase", marginTop: 2 },
  activity: {
    backgroundColor: t.surface, marginHorizontal: 16, borderRadius: 16, padding: 16,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  activityIcon: { fontSize: 18 },
  activityLabel: { fontSize: 11, color: t.text3, fontFamily: FONTS.bodySemi, textTransform: "uppercase" },
  activityValue: { fontSize: 14, color: t.text, fontFamily: FONTS.bodySemi, marginTop: 2 },
  errorText: { color: t.text2, fontSize: 14, marginBottom: 14 },
  retryBtn: { backgroundColor: t.accent, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24 },
  retryBtnText: { color: t.surface, fontFamily: FONTS.accentMedium },

  safety: { marginTop: 18, marginHorizontal: 16 },
  safetyBtn: { paddingVertical: 13, alignItems: "center" },
  safetyText: { fontSize: 13.5, color: t.text3, fontFamily: FONTS.bodySemi },
  safetyTextOn: { color: t.status.bad },
});
