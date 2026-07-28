import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import TrustBadge from "../components/TrustBadge";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";

export default function UserProfileScreen({ route }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { uid } = route.params;
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

      {status ? (
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
      ) : null}

      <View style={styles.statsRow}>
        <Stat styles={styles} number={user.meetings_created} label="Created" />
        <View style={styles.statDivider} />
        <Stat styles={styles} number={user.meetings_joined} label="Joined" />
        <View style={styles.statDivider} />
        <Stat styles={styles} number={user.meetings_swiped} label="Swiped" />
      </View>

      <View style={styles.activity}>
        <View style={styles.activityRow}>
          <Text style={styles.activityIcon}>📅</Text>
          <View>
            <Text style={styles.activityLabel}>Member since</Text>
            <Text style={styles.activityValue}>{user.joined_at || "—"}</Text>
          </View>
        </View>
        <View style={styles.activityRow}>
          <Text style={styles.activityIcon}>🟢</Text>
          <View>
            <Text style={styles.activityLabel}>Last online</Text>
            <Text style={styles.activityValue}>{user.last_online || "—"}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Stat({ number, label, styles }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNumber}>{number ?? 0}</Text>
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
});
