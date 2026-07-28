import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView, ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import TrustBadge from "../components/TrustBadge";
import TagChip from "../components/TagChip";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";
import { formatTimeUntil } from "../utils/time";

// Mirrors the web's /meeting/<id> page: a tinted hero, then the details in
// bordered sections on the neutral background.
export default function MeetingDetailScreen({ route, navigation }) {
  const { meeting } = route.params;
  const { uid, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isOnline = meeting.type === "OnlineMeeting";

  // route.params is a snapshot taken when the card was tapped, so joining has
  // to be tracked here or the button would keep claiming the old state.
  const [joined, setJoined] = useState(!!meeting.is_joined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);   // { kind: "ok" | "bad", text }
  const [attendees, setAttendees] = useState([]);
  const [loadingAttendees, setLoadingAttendees] = useState(true);

  const loadAttendees = useCallback(() => {
    api.getAttendees(meeting.id)
      .then((list) => {
        setAttendees(list);
        // meeting.is_joined was captured when the card rendered and goes stale
        // as soon as anything changes elsewhere — the attendee list is the
        // server's current answer, so the button follows it instead. Without
        // this the button can offer "Join" to someone already in, and tapping
        // it silently removes them.
        setJoined(list.some((person) => person.uid === uid));
      })
      .catch(() => setAttendees([]))
      .finally(() => setLoadingAttendees(false));
  }, [meeting.id, uid]);

  useEffect(() => {
    loadAttendees();
  }, [loadAttendees]);

  async function handleJoin() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const leaving = joined;
    try {
      // One endpoint toggles both ways; the server is the authority on which
      // way it went, so the response decides rather than the optimistic guess.
      const result = await api.joinMeeting(meeting.id);
      const nowJoined = typeof result?.joined === "boolean" ? result.joined : !leaving;
      setJoined(nowJoined);

      // A full meeting queues you instead of rejecting you, and that is neither
      // "you're in" nor "you left" — saying either would be wrong.
      let text;
      if (result?.waitlisted) {
        text = `This one is full — you're #${result.waitlist_count} on the waitlist. You'll be moved in if someone drops out.`;
      } else if (nowJoined) {
        text = `You're in — ${meeting.time}. It's in My Meetings on your profile.`;
      } else {
        text = "You've left this meeting. Your spot is free for someone else.";
      }
      setNotice({ kind: "ok", text });
      loadAttendees();
      refreshProfile();
    } catch (e) {
      setNotice({ kind: "bad", text: e.message || "That didn't go through. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={[theme.accentSoft, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={[styles.badge, isOnline ? styles.badgeOnline : styles.badgeInPerson]}>
          {isOnline ? "🌐 Online" : "📍 In-Person"}
        </Text>
        <Text style={styles.title}>{meeting.title}</Text>
        <View style={styles.whenRow}>
          <Text style={styles.time}>🕐 {meeting.time}</Text>
          {/* The web pairs the absolute time with a relative one, so you can
              tell at a glance whether this is tonight or next month. */}
          <Text style={styles.countdown}>{formatTimeUntil(meeting.time)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.creator}>👤 {meeting.creator_username}</Text>
          {meeting.creator_is_trusted ? <TrustBadge /> : null}
        </View>
      </LinearGradient>

      {notice ? (
        <View style={[styles.notice, notice.kind === "bad" && styles.noticeBad]}>
          <Text style={styles.noticeIcon}>{notice.kind === "bad" ? "⚠️" : "✅"}</Text>
          <Text style={[styles.noticeText, notice.kind === "bad" && styles.noticeTextBad]}>
            {notice.text}
          </Text>
        </View>
      ) : null}

      {/* The call link belongs to people who committed — same rule as the web */}
      {isOnline ? (
        <View style={[styles.callbox, joined && styles.callboxLive]}>
          <Text style={styles.callIcon}>{joined ? "🎥" : "🔒"}</Text>
          {joined && meeting.link ? (
            <>
              <Text style={styles.callTitle}>The call is open</Text>
              <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(meeting.link)}>
                <Text style={styles.callBtnText}>Join the call →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.callTitle}>The call link is for people who committed</Text>
              <Text style={styles.callSub}>Join this meeting and the link appears here.</Text>
            </>
          )}
        </View>
      ) : meeting.location ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Where</Text>
          <Text style={styles.body}>{meeting.location}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📝 What it is</Text>
        <Text style={styles.body}>{meeting.description}</Text>
        {meeting.tags && meeting.tags.length > 0 ? (
          <View style={styles.tagsRow}>
            {meeting.tags.map((t) => <TagChip key={t} label={t} />)}
          </View>
        ) : null}
      </View>

      {/* Threshold meetings only happen if enough people commit — the web
          gives this its own section rather than burying it in the count. */}
      {meeting.has_threshold ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 It only happens if enough people come</Text>
          <View
            style={[
              styles.threshold,
              meeting.commit_status === "confirmed" && styles.thresholdConfirmed,
              meeting.commit_status === "cancelled" && styles.thresholdCancelled,
            ]}
          >
            <View style={styles.thresholdTop}>
              <Text style={styles.thresholdLabel}>
                {attendees.length} of {meeting.min_attendees} committed
              </Text>
              {meeting.join_deadline ? (
                <Text style={styles.thresholdDeadline}>by {meeting.join_deadline}</Text>
              ) : null}
            </View>
            <View style={styles.thresholdBar}>
              <View
                style={[
                  styles.thresholdFill,
                  { width: `${Math.min(100, Math.max(0, meeting.threshold_progress || 0))}%` },
                ]}
              />
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          🤝 Who's coming <Text style={styles.count}>{attendees.length}</Text>
        </Text>

        {loadingAttendees ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 6 }} />
        ) : attendees.length ? (
          attendees.map((person) => (
            <TouchableOpacity
              key={person.uid}
              style={styles.person}
              activeOpacity={0.7}
              onPress={() => navigation.navigate("UserProfile", { uid: person.uid })}
            >
              <View style={[styles.personAvatar, { backgroundColor: person.color }]}>
                <Text style={styles.personInitial}>{person.initial}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.personNameRow}>
                  <Text style={styles.personName}>{person.username}</Text>
                  {person.is_creator ? <Text style={styles.hostTag}>host</Text> : null}
                  {person.is_trusted || person.is_admin ? <TrustBadge /> : null}
                </View>
                {/* The web shows a show-up rate under every name, or says so
                    plainly when there is nothing settled to judge them on. */}
                <Text style={[styles.record, person.reliability?.score == null && styles.recordNew]}>
                  {person.reliability?.score == null
                    ? "No record yet"
                    : `${person.reliability.score}% show-up rate`}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.body}>Nobody yet — you could be the first.</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.joinBtn, joined && styles.joinBtnActive, busy && styles.joinBtnBusy]}
        onPress={handleJoin}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color={joined ? theme.text2 : theme.accentOn} />
        ) : (
          <Text style={[styles.joinBtnText, joined && styles.joinBtnTextActive]}>
            {joined ? "You're going — tap to leave" : "Join this meeting"}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  content: { padding: 16, paddingBottom: 40 },

  hero: {
    padding: 18,
    borderRadius: RADIUS.lg,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    ...SHADOW.s1,
  },
  badge: {
    fontSize: 11,
    fontFamily: FONTS.accent,
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginBottom: 10,
    overflow: "hidden",
  },
  badgeInPerson: { backgroundColor: t.accentSoft, color: t.accentStrong },
  badgeOnline: { backgroundColor: t.surface3, color: t.text2 },
  title: { fontSize: 24, fontFamily: FONTS.heading, color: t.text, marginBottom: 8, lineHeight: 29 },
  time: { fontSize: 14, fontFamily: FONTS.accentMedium, color: t.text },
  row: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  creator: { fontSize: 13, color: t.text2 },

  callbox: {
    marginTop: 14,
    padding: 22,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    backgroundColor: t.surface2,
    borderWidth: 1,
    borderColor: t.border,
  },
  callboxLive: { backgroundColor: t.surface, borderColor: t.accent },
  callIcon: { fontSize: 32 },
  callTitle: { fontSize: 16, fontFamily: FONTS.heading, color: t.text, marginTop: 10, textAlign: "center" },
  callSub: { fontSize: 13, color: t.text2, marginTop: 6, textAlign: "center" },
  callBtn: {
    marginTop: 12,
    paddingHorizontal: 26,
    paddingVertical: 13,
    borderRadius: 13,
    backgroundColor: t.accent,
    ...SHADOW.s2,
  },
  callBtnText: { color: t.accentOn, fontFamily: FONTS.accent, fontSize: 15 },

  section: {
    marginTop: 14,
    padding: 16,
    borderRadius: RADIUS.lg,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  sectionTitle: { fontSize: 15.5, fontFamily: FONTS.heading, color: t.text, marginBottom: 8 },
  count: { fontFamily: FONTS.accentMedium, color: t.text2, fontSize: 13 },
  body: { fontSize: 14.5, color: t.text2, lineHeight: 21 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },

  joinBtn: {
    marginTop: 18,
    borderRadius: RADIUS.base,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: t.accent,
    ...SHADOW.s2,
  },
  joinBtnActive: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
  joinBtnBusy: { opacity: 0.75 },
  joinBtnText: { fontFamily: FONTS.accent, fontSize: 16, color: t.accentOn },
  joinBtnTextActive: { color: t.text2 },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 14,
    padding: 14,
    borderRadius: RADIUS.base,
    backgroundColor: t.accentSoft,
    borderWidth: 1,
    borderColor: t.accent,
  },
  noticeBad: { backgroundColor: t.surface, borderColor: t.status.bad },
  noticeIcon: { fontSize: 15, marginTop: 1 },
  noticeText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: t.accentStrong, fontFamily: FONTS.bodySemi },
  noticeTextBad: { color: t.status.bad },

  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
  },
  personAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  personInitial: { color: "#fff", fontFamily: FONTS.accent, fontSize: 13 },
  personNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  personName: { fontSize: 14, fontFamily: FONTS.bodySemi, color: t.text },
  record: { fontSize: 11.5, color: t.text3, marginTop: 1 },
  recordNew: { fontStyle: "italic" },

  threshold: {
    marginTop: 4,
    padding: 12,
    borderRadius: RADIUS.base,
    backgroundColor: t.surface2,
    borderWidth: 1,
    borderColor: t.border,
  },
  thresholdConfirmed: { borderColor: t.status.good },
  thresholdCancelled: { borderColor: t.status.bad, opacity: 0.7 },
  thresholdTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  thresholdLabel: { fontSize: 13, fontFamily: FONTS.bodySemi, color: t.text },
  thresholdDeadline: { fontSize: 11.5, color: t.text3 },
  thresholdBar: { height: 7, borderRadius: 4, backgroundColor: t.surface3, overflow: "hidden" },
  thresholdFill: { height: "100%", borderRadius: 4, backgroundColor: t.accent },

  whenRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  countdown: {
    fontSize: 11.5,
    fontFamily: FONTS.accentMedium,
    color: t.accentStrong,
    backgroundColor: t.accentSoft,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: "hidden",
  },
  hostTag: {
    fontSize: 10,
    fontFamily: FONTS.accent,
    color: t.accentStrong,
    backgroundColor: t.accentSoft,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: "hidden",
  },
  chevron: { fontSize: 20, color: t.text3 },
});
