import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../api";
import useAutoRefresh from "../hooks/useAutoRefresh";
import ReliabilityCard from "../components/ReliabilityCard";
import Appear from "../components/Appear";
import { MapPinIcon, GlobeIcon, ClockIcon } from "../components/NavIcons";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";
import { formatWhen, formatRelative } from "../utils/time";

/**
 * Activity — everything that currently wants something from you.
 *
 * A port of templates/activity.html, served by the same activity_data() the
 * web page uses. Nothing here is stored: there is no per-join timestamp in the
 * data, so a "someone joined 2h ago" feed would be invented. Every section is
 * derived from current state and is therefore always true.
 *
 * Order matters and is deliberate — the things you owe an answer on come first,
 * then what is coming up, then what is merely for information.
 */
const SECTIONS = [
  {
    key: "needs_checkin",
    title: "Did you go?",
    blurb: "These are over. Confirming is what your show-up rate is built from.",
    tone: "action",
  },
  {
    key: "needs_attendance",
    title: "Mark who came",
    blurb: "You organised these and haven't said who turned up.",
    tone: "action",
  },
  {
    key: "needs_decision",
    title: "Your call",
    blurb: "These missed their minimum by the deadline. Decide what happens.",
    tone: "action",
  },
  {
    key: "coming_up",
    title: "Coming up",
    blurb: "Meetings you've joined in the next week.",
    tone: "info",
  },
  {
    key: "waitlisted",
    title: "You're on the waitlist",
    blurb: "You move up automatically if someone drops out.",
    tone: "info",
  },
  {
    key: "waiting",
    title: "Waiting for review",
    blurb: "Yours, not visible to anyone else until an admin approves them.",
    tone: "info",
  },
  {
    key: "settled",
    title: "Settled",
    blurb: "Confirmed or called off — for information.",
    tone: "info",
  },
];

export default function ActivityScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api.getActivity()
      .then(setData)
      .catch(() => setFailed(true))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  // These sections answer "what needs me now", which goes stale the moment you
  // act on something elsewhere — so refetch on focus, on returning from the
  // background, and periodically while open.
  useAutoRefresh(load, { intervalMs: 30000 });

  // Which meetings are mid-answer, so their row can show a spinner instead of
  // two buttons that look tappable while a request is already in flight.
  const [answering, setAnswering] = useState({});

  /**
   * Answer "did you go?" without leaving the screen.
   *
   * This section has always been a dead end in the app: it named the meetings
   * waiting on an answer and then offered nowhere to give one, because the
   * mobile API had no check-in route at all. The row is dropped optimistically
   * — the server has accepted or it has not, and a row that stays put after a
   * tap reads as a failure even when it worked.
   */
  const handleCheckIn = useCallback(async (card, status) => {
    if (answering[card.id]) return;
    setAnswering((prev) => ({ ...prev, [card.id]: true }));

    const before = data;
    setData((prev) => (!prev ? prev : {
      ...prev,
      needs_checkin: prev.needs_checkin.filter((c) => c.id !== card.id),
      action_count: Math.max(0, (prev.action_count || 1) - 1),
    }));

    try {
      const result = await api.checkIn(card.id, status);
      // record_checkin returns the recalculated score, so the card above the
      // list can move immediately rather than waiting for the next refresh.
      if (result?.reliability) {
        setData((prev) => (prev ? { ...prev, reliability: result.reliability } : prev));
      }
    } catch (e) {
      setData(before);   // put the row back; nothing was recorded
      Alert.alert("Couldn't save that", e.message || "Please try again.");
    } finally {
      setAnswering((prev) => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });
    }
  }, [answering, data]);

  const openMeeting = useCallback((card) => {
    // Activity cards are a trimmed shape; the detail screen refetches the
    // attendee list itself, so an id and the basics are enough to open it.
    navigation.navigate("MeetingDetail", {
      meeting: {
        ...card,
        type: card.is_online ? "OnlineMeeting" : "InPersonMeeting",
        short_location: card.where,
      },
    });
  }, [navigation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (failed || !data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Couldn't load Activity.</Text>
        <TouchableOpacity style={styles.retry} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const live = SECTIONS.filter((s) => (data[s.key] || []).length > 0);
  const nothing = live.length === 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
      }
    >
      {/* The count is the headline: it is the reason to open this screen. */}
      <Appear>
        <View style={styles.hero}>
          <Text style={styles.heroCount}>{data.action_count}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>
              {data.action_count === 0
                ? "Nothing needs you"
                : data.action_count === 1 ? "1 thing needs you" : `${data.action_count} things need you`}
            </Text>
            <Text style={styles.heroSub}>
              {data.action_count === 0
                ? "You're all caught up."
                : "Answers here keep your show-up rate honest."}
            </Text>
          </View>
        </View>
      </Appear>

      <Appear delay={60}>
        <ReliabilityCard reliability={data.reliability} showPending style={styles.reliability} />
      </Appear>

      {nothing ? (
        <Appear delay={120}>
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptyBody}>
              Nothing waiting, nothing coming up in the next week. Have a look at Explore.
            </Text>
            <TouchableOpacity style={styles.retry} onPress={() => navigation.navigate("Explore")}>
              <Text style={styles.retryText}>Open Explore</Text>
            </TouchableOpacity>
          </View>
        </Appear>
      ) : live.map((section, i) => (
        <Appear key={section.key} delay={120 + i * 50}>
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, section.tone === "action" && styles.sectionTitleAction]}>
                {section.title}
              </Text>
              <View style={[styles.pill, section.tone === "action" && styles.pillAction]}>
                <Text style={[styles.pillText, section.tone === "action" && styles.pillTextAction]}>
                  {data[section.key].length}
                </Text>
              </View>
            </View>
            <Text style={styles.sectionBlurb}>{section.blurb}</Text>

            {data[section.key].map((card) => (
              <View key={`${section.key}-${card.id}`}>
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.75}
                  onPress={() => openMeeting(card)}
                >
                  <View style={styles.rowEmoji}>
                    <Text style={{ fontSize: 20 }}>{card.emoji || "📍"}</Text>
                  </View>

                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{card.title}</Text>
                    <Text style={styles.rowWhen} numberOfLines={1}>{formatWhen(card.time)}</Text>
                    <View style={styles.rowMeta}>
                      {card.is_online
                        ? <GlobeIcon size={11} color={theme.text3} />
                        : <MapPinIcon size={11} color={theme.text3} />}
                      <Text style={styles.rowWhere} numberOfLines={1}>
                        {card.where || (card.is_online ? "Online" : "")}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.rowRight}>
                    <ClockIcon size={11} color={theme.text3} />
                    <Text style={styles.rowRel}>{formatRelative(card.time) || "—"}</Text>
                  </View>
                </TouchableOpacity>

                {/* Answer here rather than opening the meeting to do it. Only
                    on "Did you go?" — the other two action sections need the
                    detail screen, which has the attendee list and the
                    organiser's options. */}
                {section.key === "needs_checkin" ? (
                  <View style={styles.answerRow}>
                    {answering[card.id] ? (
                      <ActivityIndicator color={theme.accent} size="small" style={{ marginVertical: 6 }} />
                    ) : (
                      <>
                        <TouchableOpacity
                          style={[styles.answerBtn, styles.answerWent]}
                          activeOpacity={0.85}
                          onPress={() => handleCheckIn(card, "went")}
                        >
                          <Text style={styles.answerWentText}>✓  I went</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.answerBtn, styles.answerMissed]}
                          activeOpacity={0.85}
                          onPress={() => handleCheckIn(card, "missed")}
                        >
                          <Text style={styles.answerMissedText}>✕  I didn't</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </Appear>
      ))}
    </ScrollView>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg, padding: 24 },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: RADIUS.lg,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    ...SHADOW.s1,
  },
  heroCount: { fontSize: 34, fontFamily: FONTS.accent, color: t.accentStrong, minWidth: 44, textAlign: "center" },
  heroTitle: { fontSize: 16, fontFamily: FONTS.heading, color: t.text },
  heroSub: { fontSize: 12.5, color: t.text3, marginTop: 2 },

  reliability: { marginTop: 12 },

  section: {
    marginTop: 14,
    padding: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 15, fontFamily: FONTS.heading, color: t.text },
  // The three "you owe an answer" sections carry the accent; the rest are grey.
  sectionTitleAction: { color: t.accentStrong },
  pill: { borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: t.surface3 },
  pillAction: { backgroundColor: t.accentSoft },
  pillText: { fontSize: 11, fontFamily: FONTS.accent, color: t.text3 },
  pillTextAction: { color: t.accentStrong },
  sectionBlurb: { fontSize: 12, color: t.text3, marginTop: 4, marginBottom: 6, lineHeight: 17 },

  row: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 9 },
  rowEmoji: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
    backgroundColor: t.surface2,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14.5, fontFamily: FONTS.bodySemi, color: t.text },
  rowWhen: { fontSize: 12, fontFamily: FONTS.accentMedium, color: t.text2, marginTop: 1 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  rowWhere: { fontSize: 11.5, color: t.text3, flexShrink: 1 },
  rowRight: { alignItems: "center", flexDirection: "row", gap: 4 },
  rowRel: { fontSize: 11, fontFamily: FONTS.accentMedium, color: t.text3 },

  // Inline answer for "Did you go?". Indented to the row's text so it
  // reads as belonging to that meeting rather than to the section.
  answerRow: { flexDirection: "row", gap: 8, paddingLeft: 49, paddingBottom: 10, alignItems: "center" },
  answerBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.pill, borderWidth: 1 },
  answerWent: { backgroundColor: t.status.goodSoft, borderColor: t.status.good },
  answerWentText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: t.status.good },
  answerMissed: { backgroundColor: t.surface2, borderColor: t.border },
  answerMissedText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: t.text2 },

  emptyBox: {
    marginTop: 14, padding: 22, borderRadius: RADIUS.lg, alignItems: "center",
    backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
  },
  emptyTitle: { fontSize: 16, fontFamily: FONTS.heading, color: t.text, textAlign: "center" },
  emptyBody: { fontSize: 13.5, color: t.text3, marginTop: 6, textAlign: "center", lineHeight: 19 },
  retry: {
    marginTop: 14, backgroundColor: t.accent, borderRadius: RADIUS.pill,
    paddingHorizontal: 22, paddingVertical: 10,
  },
  retryText: { color: t.accentOn, fontFamily: FONTS.accent, fontSize: 13.5 },
});
