import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import TrustBadge from "../components/TrustBadge";
import { FONTS } from "../styles/fonts";

export default function ProfileScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile, signOut } = useAuth();
  const [loading, setLoading] = useState(!profile);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    refreshProfile()
      .then((p) => setError(!p))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#667eea" />
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
      <View style={[styles.hero, { paddingTop: insets.top + 32 }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.uid.slice(0, 2)}</Text>
        </View>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{profile.username}</Text>
          {profile.is_trusted ? <TrustBadge /> : null}
        </View>
        <Text style={styles.email}>{profile.email}</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat number={profile.meetings_created} label="Created" />
        <Stat number={profile.meetings_joined} label="Joined" />
        <Stat number={profile.meetings_swiped} label="Swiped" />
        <Stat number={status.stats.participants} label="Signed Up" />
      </View>

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

        {status.next ? (
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
                  <Text style={styles.taskProgress}>{task.progress} / {task.target}</Text>
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

      <View style={styles.actions}>
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

        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("Joined")}>
          <Text style={styles.actionBtnText}>My Joined Meetings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.logoutBtn]} onPress={signOut}>
          <Text style={styles.logoutBtnText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Stat({ number, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statNumber}>{number}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { backgroundColor: "#667eea", paddingVertical: 32, alignItems: "center" },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  avatarText: { color: "#fff", fontFamily: FONTS.heading, fontSize: 16 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  name: { color: "#fff", fontSize: 20, fontFamily: FONTS.heading },
  email: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: "row", backgroundColor: "#fff", margin: 16, marginBottom: 0, borderRadius: 16, padding: 16, justifyContent: "space-around" },
  stat: { alignItems: "center" },
  statNumber: { fontSize: 22, fontFamily: FONTS.accent, color: "#2c3e50" },
  statLabel: { fontSize: 10, fontFamily: FONTS.bodySemi, color: "#aaa", textTransform: "uppercase", marginTop: 2 },
  statusCard: { backgroundColor: "#fff", margin: 16, borderRadius: 18, padding: 18 },
  statusHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  statusEmoji: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#667eea", alignItems: "center", justifyContent: "center" },
  statusLabel: { fontSize: 10, fontFamily: FONTS.bodySemi, color: "#aaa", textTransform: "uppercase" },
  statusName: { fontSize: 17, fontFamily: FONTS.heading, color: "#2c3e50" },
  statusBlurb: { fontSize: 11, color: "#999" },
  nextSection: { borderTopWidth: 1, borderTopColor: "#f0f1f3", paddingTop: 12 },
  nextLabel: { fontSize: 12, fontWeight: "700", color: "#888", marginBottom: 8 },
  task: { flexDirection: "row", gap: 10, paddingVertical: 6, alignItems: "flex-start" },
  taskCheck: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: "#dce1e7", alignItems: "center", justifyContent: "center", marginTop: 2 },
  taskCheckDone: { backgroundColor: "#2ecc71", borderColor: "#2ecc71" },
  taskCheckMark: { color: "#fff", fontSize: 10, fontWeight: "800" },
  taskLabel: { fontSize: 13, fontWeight: "600", color: "#444" },
  taskLabelDone: { color: "#2ecc71" },
  taskProgress: { fontSize: 11, color: "#aaa", marginTop: 1 },
  taskBar: { height: 5, borderRadius: 3, backgroundColor: "#eee", marginTop: 4, overflow: "hidden" },
  taskBarFill: { height: "100%", backgroundColor: "#667eea" },
  maxed: { textAlign: "center", color: "#999", fontSize: 13 },
  tierPills: { flexDirection: "row", flexWrap: "wrap", gap: 6, borderTopWidth: 1, borderTopColor: "#f0f1f3", paddingTop: 12, marginTop: 4 },
  tierPill: { fontSize: 10, fontWeight: "700", color: "#aaa", backgroundColor: "#f5f6f8", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  tierPillUnlocked: { color: "#667eea", backgroundColor: "rgba(102,126,234,0.12)" },
  actions: { padding: 16, gap: 10 },
  actionBtn: { backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18 },
  actionBtnText: { fontFamily: FONTS.accentMedium, color: "#2c3e50", fontSize: 14 },
  urgentBtn: { backgroundColor: "#ff6262", flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  urgentBtnText: { fontFamily: FONTS.accentMedium, color: "#fff", fontSize: 14 },
  pendingBadge: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pendingBadgeText: { color: "#ff6262", fontFamily: FONTS.accent, fontSize: 12 },
  logoutBtn: {},
  logoutBtnText: { fontFamily: FONTS.accentMedium, color: "#e74c3c", fontSize: 14 },
  errorText: { color: "#888", fontSize: 14, marginBottom: 14 },
  retryBtn: { backgroundColor: "#667eea", borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24 },
  retryBtnText: { color: "#fff", fontFamily: FONTS.accentMedium },
});
