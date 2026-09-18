import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { api } from "../api";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS, SHADOW } from "../styles/theme";
import Appear from "../components/Appear";
import CountUp from "../components/CountUp";
import { formatWhen } from "../utils/time";
import { IS_HOST } from "../variant";

/**
 * Both ways out of this screen lead to MeetingDetail, which Metz Host does not
 * register — it is the full app's screen, with the map, the discussion and the
 * join flow on it, and pulling it into the light app would undo the point of
 * the light app. So in Host these stay as the figures they are: still worth
 * reading, no longer a tap that goes nowhere. Answering a question means
 * opening the meeting in Metz, or following the share link.
 */
const openable = (navigation, id) => (IS_HOST ? undefined : () => navigation.navigate("MeetingDetail", { meeting: { id } }));

/**
 * How one meeting is actually doing, for the person running it.
 *
 * An organiser could already open their meeting and count the rows, which
 * covers who is coming. What that page cannot tell them is whether sharing did
 * anything: a link nobody opened and a link nobody acted on look identical from
 * there — no joins either way — so "share it again" was always a guess.
 *
 * Hence the funnel at the top. Opens, then names down, in that order, because
 * the gap between the two is the number that tells an organiser what to do
 * next: nobody opening it means share it somewhere else, plenty opening and
 * nobody joining means the meeting itself is not landing.
 *
 * Host-only, and enforced on the server — the guest breakdown says things about
 * a meeting that nobody else should read off a public id.
 */
export default function MeetingInsightsScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { meetingId } = route.params;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api.getMeetingInsights(meetingId)
      .then(setData)
      .catch(() => setFailed(true))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [meetingId]);

  // Refetched on focus rather than once on mount: this is the screen someone
  // comes back to after sending the link, and a stale count is the one thing
  // it must not show.
  useFocusEffect(useCallback(() => { load(); }, [load]));

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
        <Text style={styles.errorText}>{t("insights.loadFailed")}</Text>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryBtnText}>{t("common.retry")}</Text>
        </Pressable>
      </View>
    );
  }

  const pending = data.status === "pending";
  // Opens are unique browsers, so this is closer to "how many people looked"
  // than to page loads, and comparing it with joins is fair.
  const converted = data.views > 0 ? Math.round((data.going / data.views) * 100) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
          tintColor={theme.accent}
        />
      }
    >
      <Pressable style={styles.head} onPress={openable(navigation, data.id)} disabled={IS_HOST}>
        <Text style={styles.title} numberOfLines={2}>
          {data.emoji ? `${data.emoji}  ` : ""}{data.title}
        </Text>
        <Text style={styles.when}>{formatWhen(data.time)}</Text>
      </Pressable>

      {/* A meeting waiting on review is not on the map and its link 404s, and
          an organiser watching a flat zero deserves to know that is why. */}
      {pending ? (
        <Appear offset={-6}>
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{t("insights.pendingNotice")}</Text>
          </View>
        </Appear>
      ) : null}

      <Appear delay={40}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("insights.reachTitle")}</Text>
          <View style={styles.funnel}>
            <Figure styles={styles} value={data.views} label={t("insights.opened")} />
            <Text style={styles.arrow}>›</Text>
            <Figure styles={styles} value={data.going} label={t("insights.going")} accent />
          </View>
          <Text style={styles.hint}>
            {data.views === 0
              ? t("insights.reachNone")
              : converted !== null
                ? t("insights.reachRate", { percent: converted })
                : ""}
          </Text>
        </View>
      </Appear>

      <Appear delay={90}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("insights.whereFromTitle")}</Text>
          {/* The split the meeting page cannot show. A guest has no account —
              they are exactly the people the link brought in, which makes this
              the one honest measure of whether sharing is worth doing. */}
          <Split
            styles={styles}
            theme={theme}
            fromLink={data.from_link}
            fromApp={data.from_app}
            t={t}
          />
        </View>
      </Appear>

      {data.min_attendees || data.max_attendees ? (
        <Appear delay={140}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("insights.thresholdTitle")}</Text>
            {data.min_attendees ? (
              <>
                <Text style={styles.line}>
                  {t("insights.minimumLine", { going: data.going, min: data.min_attendees })}
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${Math.min(100, Math.round((data.going / data.min_attendees) * 100))}%` },
                      data.going >= data.min_attendees && styles.barFillMet,
                    ]}
                  />
                </View>
              </>
            ) : null}
            {data.spots_left !== null && data.spots_left !== undefined ? (
              <Text style={styles.line}>
                {data.spots_left > 0
                  ? t("insights.spotsLeft", { count: data.spots_left })
                  : t("insights.full")}
              </Text>
            ) : null}
            {data.join_deadline ? (
              <Text style={styles.hint}>
                {t("insights.deadline", { when: formatWhen(data.join_deadline) })}
              </Text>
            ) : null}
          </View>
        </Appear>
      ) : null}

      <Appear delay={190}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("insights.youTitle")}</Text>
          {/* Two rows, and both are things only the organiser can clear. */}
          <Pressable style={styles.todo} onPress={openable(navigation, data.id)} disabled={IS_HOST}>
            <Text style={styles.todoValue}>{data.questions}</Text>
            <Text style={styles.todoLabel}>{t("insights.questions")}</Text>
            {/* No chevron where there is nowhere to go. */}
            {IS_HOST ? null : <Text style={styles.chevron}>›</Text>}
          </Pressable>
          {data.is_over ? (
            <View style={styles.todo}>
              <Text style={styles.todoValue}>{data.awaiting_checkin}</Text>
              <Text style={styles.todoLabel}>{t("insights.awaitingCheckin")}</Text>
            </View>
          ) : null}
          {data.is_over && (data.said_went || data.said_missed) ? (
            <Text style={styles.hint}>
              {t("insights.settled", { went: data.said_went, missed: data.said_missed })}
            </Text>
          ) : null}
        </View>
      </Appear>
    </ScrollView>
  );
}

function Figure({ styles, value, label, accent }) {
  return (
    <View style={styles.figure}>
      <CountUp value={value} style={[styles.figureValue, accent && styles.figureValueOn]} />
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

/**
 * Where the people coming actually came from, as one bar rather than two
 * numbers — the proportion is the point, and two figures side by side make the
 * reader do the division.
 */
function Split({ styles, theme, fromLink, fromApp, t }) {
  const total = fromLink + fromApp;
  if (!total) return <Text style={styles.hint}>{t("insights.noOneYet")}</Text>;

  return (
    <>
      <View style={styles.splitTrack}>
        <View style={[styles.splitLink, { flex: fromLink || 0 }]} />
        <View style={[styles.splitApp, { flex: fromApp || 0 }]} />
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: theme.accent }]} />
          <Text style={styles.legendText}>{t("insights.fromLink", { count: fromLink })}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: theme.text3 }]} />
          <Text style={styles.legendText}>{t("insights.fromApp", { count: fromApp })}</Text>
        </View>
      </View>
    </>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
  errorText: { color: t.text2, fontSize: t.fs(14), marginBottom: 14 },
  retryBtn: { backgroundColor: t.accent, borderRadius: RADIUS.pill, paddingVertical: 10, paddingHorizontal: 24 },
  retryBtnText: { color: t.accentOn, fontFamily: FONTS.accentMedium },

  head: { marginBottom: 14 },
  title: { fontSize: t.fs(20), fontFamily: FONTS.heading, color: t.text },
  when: { fontSize: t.fs(13), color: t.text3, marginTop: 3 },

  notice: {
    backgroundColor: t.status.warnSoft, borderRadius: RADIUS.base,
    padding: 12, marginBottom: 14,
  },
  noticeText: { fontSize: t.fs(13), color: t.status.warn, fontFamily: FONTS.bodySemi, lineHeight: 19 },

  card: {
    backgroundColor: t.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: t.border, padding: 16, marginBottom: 14, ...SHADOW.s1,
  },
  cardTitle: {
    fontSize: t.fs(11), fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginBottom: 12,
  },

  funnel: { flexDirection: "row", alignItems: "center" },
  figure: { flex: 1, alignItems: "center" },
  figureValue: { fontFamily: FONTS.accent, fontSize: t.fs(34), color: t.text },
  figureValueOn: { color: t.accent },
  figureLabel: {
    fontSize: t.fs(10.5), fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginTop: 2, textAlign: "center",
  },
  arrow: { fontSize: t.fs(26), color: t.text3, paddingHorizontal: 4 },
  hint: { fontSize: t.fs(12.5), color: t.text3, marginTop: 10, lineHeight: 18 },

  splitTrack: {
    flexDirection: "row", height: 10, borderRadius: 5,
    overflow: "hidden", backgroundColor: t.surface2,
  },
  splitLink: { backgroundColor: t.accent },
  splitApp: { backgroundColor: t.text3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: t.fs(12.5), color: t.text2 },

  line: { fontSize: t.fs(14), color: t.text, fontFamily: FONTS.bodySemi, marginBottom: 8 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: t.surface2, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: t.status.warn },
  barFillMet: { backgroundColor: t.status.good },

  todo: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  todoValue: { fontFamily: FONTS.accent, fontSize: t.fs(18), color: t.text, minWidth: 26 },
  todoLabel: { flex: 1, fontSize: t.fs(14), color: t.text2 },
  chevron: { fontSize: t.fs(20), color: t.text3 },
});
