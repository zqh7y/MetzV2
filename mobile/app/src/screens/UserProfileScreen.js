import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import TrustBadge from "../components/TrustBadge";
import ReliabilityCard from "../components/ReliabilityCard";
import MeetingCard from "../components/MeetingCard";
import ReportSheet from "../components/ReportSheet";
import Appear from "../components/Appear";
import { FONTS } from "../styles/fonts";
import AnimatedBackdrop from "../components/AnimatedBackdrop";
import ProfileAvatar from "../components/ProfileAvatar";
import { backgroundFor } from "../styles/profileLooks";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";
import { useI18n } from "../context/LocaleContext";
// Module-scope helper below, so it takes the plain `t` rather than the hook.
import { t } from "../i18n/active";
import { getActiveLanguage } from "../i18n/active";
import { Alert } from "../components/AppAlert";

// Convert the UTC timestamp from the API into a date and time people can read.
function formatProfileTime(value) {
  if (!value) return t("userProfile.notAvailable");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("userProfile.notAvailable");
  return date.toLocaleString(getActiveLanguage(), {
    day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function UserProfileScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { t, language } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { uid } = route.params;
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
      Alert.alert(t("userProfile.unblockTitle"), t("userProfile.unblockBody"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("userProfile.unblock"),
          onPress: () => api.unblockUser(uid).then(() => setBlocked(false)).catch(() => {}),
        },
      ]);
      return;
    }
    Alert.alert(
      t("userProfile.blockTitle"),
      t("userProfile.blockBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("userProfile.block"),
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
        <Text style={styles.errorText}>{t("userProfile.loadFailed")}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryBtnText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const memberSince = (() => {
    if (!user.joined_at) return "\u2014";
    const d = new Date(user.joined_at);
    if (Number.isNaN(d.getTime())) return "\u2014";
    try {
      return new Intl.DateTimeFormat(language, { month: "short", year: "numeric" }).format(d);
    } catch {
      return `${d.getMonth() + 1}/${d.getFullYear()}`;
    }
  })();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      {/* Someone else's chosen look travels with them: a frame you only ever
          saw on your own profile would not be worth choosing. */}
      <AnimatedBackdrop
        colors={backgroundFor(user.profile_background, theme)}
        style={styles.hero}
      >
        <ProfileAvatar
          size={84}
          frame={user.profile_frame}
          face={user.avatar_face}
          emoji={user.avatar_emoji}
          initials={user.username.slice(0, 2).toUpperCase()}
          color={user.profile_color || "#667eea"}
          style={{ marginBottom: 14 }}
        />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user.display_name || user.username}</Text>
          {user.is_trusted ? <TrustBadge /> : null}
        </View>
        <Text style={styles.uid}>@{user.uid}</Text>

        {profile?.is_admin ? (
          <TouchableOpacity style={styles.trustBtn} onPress={handleToggleTrust} activeOpacity={0.85}>
            <Text style={styles.trustBtnText}>{user.is_trusted ? "★ Remove Trusted Status" : "☆ Mark as Trusted"}</Text>
          </TouchableOpacity>
        ) : null}
      </AnimatedBackdrop>

      {/* No "to confirm" chip here: user_profile.html prints only the settled
          counts, because someone else's unanswered meetings are not the
          viewer's business. */}
      <Appear delay={40}>
        <ReliabilityCard
          reliability={user.reliability}
          style={styles.reliability}
          facts={[
            { value: t(user.is_trusted || user.is_admin ? "common.yes" : "common.no"),
              label: t("profile.statTrusted") },
            { value: memberSince, label: t("profile.statMemberSince") },
          ]}
          roles={user.is_admin ? [`\u{1F6E0} ${t("profile.roleModerator")}`] : []}
        />
      </Appear>

      {user.bio || user.interests?.length ? (
        <Appear delay={100}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {t(user.bio ? "userProfile.about" : "userProfile.interests")}
            </Text>
            {user.bio ? <Text style={styles.aboutText}>{user.bio}</Text> : null}
            {user.bio && user.interests?.length ? <View style={styles.aboutRule} /> : null}
            {user.interests?.length ? (
              <View style={styles.chips}>
                {user.interests.map((tag) => (
                  <Text key={tag} style={styles.chip}>{tag}</Text>
                ))}
              </View>
            ) : null}
          </View>
        </Appear>
      ) : null}

      {user.hosting?.length ? (
        <Appear delay={160}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {t("userProfile.hosting", { name: user.display_name || user.username })}
            </Text>
            {user.hosting.map((m) => (
              <View key={m.id} style={styles.hostedItem}>
                <MeetingCard
                  meeting={m}
                  onPress={() => navigation.navigate("MeetingDetail", { meeting: m })}
                />
              </View>
            ))}
          </View>
        </Appear>
      ) : null}

      <Appear delay={220}>
      <View style={styles.activity}>
        <View style={styles.activityRow}>
          <Text style={styles.activityIcon}>🟢</Text>
          <View>
            <Text style={styles.activityLabel}>{t("userProfile.lastOnline")}</Text>
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
            <Text style={styles.safetyText}>{`⚑  ${t("userProfile.reportPerson")}`}</Text>
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


const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { alignItems: "center", paddingTop: 28, paddingBottom: 26, paddingHorizontal: 24 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  // White, not t.text. The hero is a colour the person chose from seven
  // gradients, and dark navy was legible on none of them — it read as a
  // mistake on the darker ones and as muddy on the rest. The shadow is what
  // keeps it readable on the pale end of the range without darkening the
  // artwork for everyone.
  name: {
    fontSize: t.fs(23), fontFamily: FONTS.heading, color: "#fff",
    textShadowColor: "rgba(0,0,0,0.18)", textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // The hero is a coloured gradient now, not the page background, so the
  // muted grey this used sat almost invisibly on top of it.
  // A handle is a label, not a sentence — as loose text under the name it
  // read as a second, dimmer name. In a pill it is clearly an identifier.
  uid: {
    fontSize: t.fs(11.5), color: "rgba(255,255,255,0.92)", fontFamily: FONTS.accentMedium,
    backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    marginTop: 8,
  },
  trustBtn: { backgroundColor: t.accent, borderRadius: 24, paddingVertical: 12, paddingHorizontal: 24 },
  trustBtnText: { color: t.surface, fontFamily: FONTS.accentMedium },
  card: {
    backgroundColor: t.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: t.border, marginHorizontal: 16, marginTop: 16,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  cardTitle: {
    fontSize: t.fs(11), fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginBottom: 10,
  },
  // A bio is a sentence, so it is set as body text on a card rather than as
  // centred white type over the hero artwork. Left-aligned for the same
  // reason: centring reads as a caption, and a caption is not what this is.
  aboutText: { fontSize: t.fs(14.5), lineHeight: 21, color: t.text2, fontFamily: FONTS.body },
  aboutRule: { height: 1, backgroundColor: t.border, marginVertical: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: RADIUS.pill,
    backgroundColor: t.surface2, color: t.text2,
    fontSize: t.fs(12.5), fontFamily: FONTS.bodySemi, overflow: "hidden",
  },
  // The card already provides the outer gap; only the space between them.
  hostedItem: { marginBottom: 10 },
  reliability: { marginHorizontal: 16, marginBottom: 14 },
  activity: {
    backgroundColor: t.surface, marginHorizontal: 16, borderRadius: 16, padding: 16,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  activityIcon: { fontSize: t.fs(18) },
  activityLabel: { fontSize: t.fs(11), color: t.text3, fontFamily: FONTS.bodySemi, textTransform: "uppercase" },
  activityValue: { fontSize: t.fs(14), color: t.text, fontFamily: FONTS.bodySemi, marginTop: 2 },
  errorText: { color: t.text2, fontSize: t.fs(14), marginBottom: 14 },
  retryBtn: { backgroundColor: t.accent, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24 },
  retryBtnText: { color: t.surface, fontFamily: FONTS.accentMedium },

  safety: { marginTop: 18, marginHorizontal: 16 },
  safetyBtn: { paddingVertical: 13, alignItems: "center" },
  safetyText: { fontSize: t.fs(13.5), color: t.text3, fontFamily: FONTS.bodySemi },
  safetyTextOn: { color: t.status.bad },
});
