import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Pressable } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import TrustBadge from "../components/TrustBadge";
import ReliabilityCard from "../components/ReliabilityCard";
import MeetingCard from "../components/MeetingCard";
import { IS_HOST } from "../variant";
import Appear from "../components/Appear";
import AccountSheet from "../components/AccountSheet";
import EditProfileForm from "./EditProfileScreen";
import { Alert } from "../components/AppAlert";
import AnimatedBackdrop from "../components/AnimatedBackdrop";
import ProfileAvatar from "../components/ProfileAvatar";
import { backgroundFor } from "../styles/profileLooks";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";
import { useI18n } from "../context/LocaleContext";

/** "2026-07-25 14:30" -> Date, or null if the server sent something odd. */
function parseTime(value) {
  if (!value) return null;
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export default function ProfileScreen({ navigation, route }) {
  const { theme } = useTheme();
  const { t, language } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile, signOut } = useAuth();
  const [loading, setLoading] = useState(!profile);
  const [error, setError] = useState(false);
  const [accountSheet, setAccountSheet] = useState(false);

  /**
   * Editing is a mode of this screen, not a section of it.
   *
   * Edit Profile was its own screen, one drawer row below this one, so seeing
   * what you look like and changing it were two destinations. Folding it in
   * removed the second row; rendering it *within* the page was the wrong half
   * of that, because everything the profile shows stayed underneath — you
   * scrolled through your own stats, tiers and meeting list to get from the
   * bio field to Save, past a second copy of your avatar on the way. So the
   * form replaces the page while it is open, and the page comes back when you
   * save or cancel.
   *
   * `route.params.edit` is how Settings' "Edit profile" row still lands on the
   * form in one tap now that it is a mode here rather than a screen.
   */
  const [editing, setEditing] = useState(!!route?.params?.edit);
  const [editDirty, setEditDirty] = useState(false);

  useEffect(() => {
    if (!route?.params?.edit) return;
    setEditing(true);
    // Cleared once acted on. navigate() merges params into a route that is
    // already in the stack, so leaving it set meant the second trip from
    // Settings changed nothing — edit was already true, this effect never ran
    // again, and the tap landed on the profile instead of the form.
    navigation.setParams({ edit: undefined });
  }, [route?.params?.edit, navigation]);

  // The header belongs to whichever of the two is on screen.
  useEffect(() => {
    navigation.setOptions({ title: editing ? t("nav.editProfile") : t("nav.myProfile") });
  }, [navigation, editing, t]);

  /**
   * Back, while editing, means "back to the profile" — not "off this screen".
   *
   * Owned here rather than in the form because only this screen knows there is
   * something to fall back to. The form reports whether anything would be lost
   * (onDirtyChange) and this decides what to do about it.
   */
  useEffect(() => {
    if (!editing) return undefined;
    const sub = navigation.addListener("beforeRemove", (event) => {
      event.preventDefault();
      if (!editDirty) {
        setEditing(false);
        return;
      }
      Alert.alert(
        "Discard changes?",
        "You've edited your profile but haven't saved.",
        [
          { text: "Keep editing", style: "cancel" },
          { text: "Discard", style: "destructive", onPress: () => setEditing(false) },
        ]
      );
    });
    return sub;
  }, [navigation, editing, editDirty]);

  // My Meetings — what the standalone Joined tab used to show
  const [joined, setJoined] = useState([]);
  const [joinedTab, setJoinedTab] = useState("upcoming");

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

  if (editing) {
    return (
      <EditProfileForm
        navigation={navigation}
        onDone={() => setEditing(false)}
        onDirtyChange={setEditDirty}
      />
    );
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
        <Text style={styles.errorText}>{t("profile.loadFailed")}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryBtnText}>{t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // An older API does not send highlights; the zeros render as a quiet row
  // rather than crashing on a missing object.
  const highlights = profile.highlights || { hosted: 0, people_met: 0 };

  // Roles, not ranks. Held or not held, never a progress bar: both are granted
  // by a person, so showing them as something to work towards would promise a
  // route that does not exist.
  const roles = [];
  if (profile.is_admin) roles.push(`\u{1F6E0} ${t("profile.roleModerator")}`);

  // "Sep 2026" — short enough for a tile, and localised, since the app ships
  // seven languages including two right-to-left ones.
  const memberSince = (() => {
    const raw = highlights.member_since || profile.joined_at;
    if (!raw) return "\u2014";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "\u2014";
    try {
      return new Intl.DateTimeFormat(language, { month: "short", year: "numeric" }).format(d);
    } catch {
      return `${d.getMonth() + 1}/${d.getFullYear()}`;
    }
  })();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      {/* The hero is the one large surface on the profile, so it is what the
          background choice actually colours. A flat accent bar was the same
          for everybody and made every profile look like a form. */}
      <AnimatedBackdrop
        colors={backgroundFor(profile.profile_background, theme)}
        style={[styles.hero, { paddingTop: insets.top + 28 }]}
      >
        <ProfileAvatar
          size={108}
          frame={profile.profile_frame}
          face={profile.avatar_face}
          emoji={profile.avatar_emoji}
          initials={initialsFor(profile)}
        />
        <View style={styles.nameRow}>
          <Text style={styles.name}>{profile.display_name || profile.username}</Text>
          {profile.is_trusted ? <TrustBadge /> : null}
        </View>
        <Text style={styles.email}>{profile.email}</Text>
        {/* The uid is how people find each other in Find People, so it belongs
            on the profile rather than only in search results. Host has no way
            to look anyone up, so it would be an identifier for nothing. */}
        {IS_HOST ? null : <Text style={styles.heroUid}>@{profile.uid}</Text>}

        {/* Editing your profile used to be the fourth of six identical grey
            buttons at the very bottom, under Find People. It is the thing
            people come to their own profile to do, so it sits with the thing
            it edits. */}
        <View style={styles.heroActions}>
          <TouchableOpacity
            style={styles.heroBtn}
            activeOpacity={0.85}
            onPress={() => setEditing(true)}
          >
            <Text style={styles.heroBtnText}>{t("nav.editProfile")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroBtnGhost}
            activeOpacity={0.85}
            onPress={() => navigation.navigate("Settings")}
          >
            <Text style={styles.heroBtnGhostText}>{t("nav.settings")}</Text>
          </TouchableOpacity>
        </View>
      </AnimatedBackdrop>

      {/* One card, not three.
          The show-up rate, the figures under it and the old status card were
          the same subject split into unrelated boxes: "Attended" is literally
          the numerator of the percentage above it, and it used to sit two
          cards away from it.

          The tier ladder and its missions are gone. A list of goals that
          unlocks a title is an instruction to manufacture whatever the goal
          counts — meetings that never happen, attendance nobody checks — and
          the app cannot tell a real turnout from an arranged one. What is left
          is a record rather than a game: figures describing what someone has
          actually done, with nothing to win by inflating them.

          Trusted and Moderator stay, as the roles they always were: granted by
          a person, shown when held, never presented as something to work
          towards. */}
      {/* Turning up is what this card measures, and Metz Host cannot join a
          meeting — there is no screen for it. A show-up rate that can only
          ever read 0% is worse than no card at all. */}
      {IS_HOST ? null : (
      <Appear delay={40}>
        <ReliabilityCard
          reliability={profile.reliability}
          showPending
          style={styles.reliability}
          facts={[
            { value: t(profile.is_trusted || profile.is_admin ? "common.yes" : "common.no"),
              label: t("profile.statTrusted") },
            { value: memberSince, label: t("profile.statMemberSince") },
          ]}
          roles={roles}
        />
      </Appear>
      )}

      {/* The sign-up asks what you are into and then nothing ever repeated it
          back, so the answer may as well not have been given. */}
      {/* The heading follows the contents. Titling a card "About" when the
          only thing in it is a row of tags describes something that is not
          there, and left a label sitting over a lot of nothing. */}
      {/* A bio and a row of interests are how somebody browsing decides to
          follow you. Nobody browses in Host — it has no Explore, no profiles
          but your own, and no way in except a link you sent yourself. */}
      {IS_HOST ? null : (
      <Appear delay={90}>
        <View style={styles.interestsCard}>
          <Text style={styles.interestsTitle}>
            {t(profile.bio ? "userProfile.about" : "userProfile.interests")}
          </Text>
          {profile.bio ? (
            <Text style={styles.aboutText}>{profile.bio}</Text>
          ) : (
            // Dead space turned into the one action that would fill it.
            <Pressable onPress={() => setEditing(true)}>
              <Text style={styles.aboutPrompt}>{t("profile.addBio")}</Text>
            </Pressable>
          )}
          {profile.interests?.length ? (
            <>
              <View style={styles.aboutRule} />
              <View style={styles.interestChips}>
                {profile.interests.map((tag) => (
                  <Text key={tag} style={styles.interestChip}>{tag}</Text>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </Appear>
      )}

      {/* My Meetings — the old Joined tab, folded in here.
          Absent from Host twice over: it lists meetings you joined rather than
          ran, and every card here opens MeetingDetail, which Host does not
          register — so in the light app these would be rows that crash. What
          you have run is the whole of Host's home screen already. */}
      {IS_HOST ? null : (
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{`🤝 ${t("profile.myMeetings")}`}</Text>
          <View style={styles.segmented}>
            <TouchableOpacity
              style={[styles.segBtn, joinedTab === "upcoming" && styles.segBtnActive]}
              onPress={() => setJoinedTab("upcoming")}
            >
              <Text style={[styles.segText, joinedTab === "upcoming" && styles.segTextActive]}>
                {t("profile.upcomingCount", { n: upcoming.length })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segBtn, joinedTab === "past" && styles.segBtnActive]}
              onPress={() => setJoinedTab("past")}
            >
              <Text style={[styles.segText, joinedTab === "past" && styles.segTextActive]}>
                {t("profile.pastCount", { n: past.length })}
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
              ? t("profile.nothingComingUp")
              : t("profile.noPastMeetings")}
          </Text>
        )}
      </View>
      )}

      <View style={styles.actions}>
        {/* Moderation is not part of the light app: AdminDashboard and
            AdminPending are not registered in HostNavigator, so these would
            not be clutter, they would be a crash. */}
        {!IS_HOST && profile.is_admin && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("AdminDashboard")}>
            <Text style={styles.actionBtnText}>🛠️  Developer Dashboard</Text>
          </TouchableOpacity>
        )}

        {!IS_HOST && profile.is_admin && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.urgentBtn]}
            onPress={() => navigation.navigate("AdminPending")}
          >
            <Text style={styles.urgentBtnText}>{`⏳ ${t("profile.reviewPending")}`}</Text>
            {profile.pending_review_count > 0 ? (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>{profile.pending_review_count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}

        {/* Host's home screen carries this as its one standing button, so a
            second copy here would be the same action twice on two screens. */}
        {IS_HOST ? null : (
          <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate("Create")}>
            <Text style={styles.actionBtnText}>{`+ ${t("profile.createMeeting")}`}</Text>
          </TouchableOpacity>
        )}

        {/* Edit profile and Settings now live in the hero, next to what they
            change, rather than repeating here. */}
        <TouchableOpacity style={[styles.actionBtn, styles.logoutBtn]} onPress={() => setAccountSheet(true)}>
          <Text style={styles.logoutBtnText}>{t("account.logOut")}</Text>
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

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { paddingBottom: 26, alignItems: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: {
    color: "#fff", fontSize: t.fs(23), fontFamily: FONTS.heading,
    textShadowColor: "rgba(0,0,0,0.18)", textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  email: { color: "rgba(255,255,255,0.72)", fontSize: t.fs(12.5), marginTop: 3 },
  heroUid: {
    fontSize: t.fs(11.5), color: "rgba(255,255,255,0.92)", fontFamily: FONTS.accentMedium,
    backgroundColor: "rgba(255,255,255,0.18)", overflow: "hidden",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
    marginTop: 8,
  },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  heroBtn: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.pill,
    backgroundColor: t.surface,
  },
  heroBtnText: { color: t.accentStrong, fontFamily: FONTS.headingSemi, fontSize: t.fs(13.5) },
  heroBtnGhost: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: RADIUS.pill,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.45)",
  },
  heroBtnGhostText: { color: t.surface, fontFamily: FONTS.headingSemi, fontSize: t.fs(13.5) },
  stat: { alignItems: "center", flex: 1 },
  statNumber: { fontSize: t.fs(22), fontFamily: FONTS.accent, color: t.text },
  statLabel: { fontSize: t.fs(10), fontFamily: FONTS.bodySemi, color: t.text3, textTransform: "uppercase", marginTop: 2 },
  interestsCard: {
    backgroundColor: t.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: t.border, marginHorizontal: 16, marginTop: 16,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  interestsTitle: {
    fontSize: t.fs(11), fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginBottom: 10,
  },
  aboutPrompt: { fontSize: t.fs(14), color: t.accentStrong, fontFamily: FONTS.bodySemi },
  // A bio is a sentence, so it is set as body text on a card rather than as
  // centred white type over the hero artwork. Left-aligned for the same
  // reason: centring reads as a caption, and a caption is not what this is.
  aboutText: { fontSize: t.fs(14.5), lineHeight: 21, color: t.text2, fontFamily: FONTS.body },
  aboutRule: { height: 1, backgroundColor: t.border, marginVertical: 12 },
  interestChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  interestChip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: RADIUS.pill,
    backgroundColor: t.surface2, color: t.text2,
    fontSize: t.fs(12.5), fontFamily: FONTS.bodySemi, overflow: "hidden",
  },
  reliability: { marginHorizontal: 16, marginTop: 16 },
  section: { backgroundColor: t.surface, marginHorizontal: 16, marginTop: 16, borderRadius: 18, padding: 16 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 },
  sectionTitle: { fontSize: t.fs(15), fontFamily: FONTS.heading, color: t.text, marginBottom: 10 },
  sectionEmpty: { color: t.text3, fontSize: t.fs(13), textAlign: "center", paddingVertical: 14 },
  segmented: { flexDirection: "row", backgroundColor: t.surface2, borderRadius: 12, padding: 3 },
  segBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  segBtnActive: { backgroundColor: t.surface, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, elevation: 1 },
  segText: { fontSize: t.fs(12), fontFamily: FONTS.bodySemi, color: t.text3 },
  segTextActive: { color: t.text },
  pastCard: { opacity: 0.62 },
  actions: { padding: 16, gap: 10 },
  actionBtn: { backgroundColor: t.surface, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18 },
  actionBtnText: { fontFamily: FONTS.accentMedium, color: t.text, fontSize: t.fs(14) },
  urgentBtn: { backgroundColor: t.status.bad, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  urgentBtnText: { fontFamily: FONTS.accentMedium, color: t.surface, fontSize: t.fs(14) },
  pendingBadge: { backgroundColor: t.surface, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  pendingBadgeText: { color: t.status.bad, fontFamily: FONTS.accent, fontSize: t.fs(12) },
  logoutBtn: {},
  logoutBtnText: { fontFamily: FONTS.accentMedium, color: t.status.bad, fontSize: t.fs(14) },
  errorText: { color: t.text2, fontSize: t.fs(14), marginBottom: 14 },
  retryBtn: { backgroundColor: t.accent, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 24 },
  retryBtnText: { color: t.surface, fontFamily: FONTS.accentMedium },
});
