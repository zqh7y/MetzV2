import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Pressable,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { api } from "../api";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import Appear from "../components/Appear";
import CountUp from "../components/CountUp";

/**
 * Every number in one place, and the conversations that go with them.
 *
 * These used to be spread across three screens: totals on the home screen, a
 * "reach" card inside each meeting, and the discussions somewhere between the
 * two. That meant the home screen — the one an organiser opens to *do*
 * something — led with figures, and the meeting page mixed "how is it doing"
 * with "what can I change about it". Neither question got a straight answer.
 *
 * So: the meeting page is for running a meeting, home is for the meetings
 * themselves, and everything measured lives here behind one icon. Somebody who
 * wants to know how it is going comes looking; somebody who wants to post
 * another one never has to read a percentage.
 */
export default function HostStatsScreen({ navigation }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    api.getHostDashboard()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const totals = data?.totals || {};
  const meetings = data?.meetings || [];
  const talking = meetings.filter((m) => m.questions > 0);

  const fromLink = totals.from_link || 0;
  const fromApp = Math.max(0, (totals.going || 0) - fromLink);
  const total = fromLink + fromApp;

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
      <Appear>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("hostDash.totalsTitle")}</Text>
          <View style={styles.totals}>
            <Total styles={styles} value={totals.hosted} label={t("hostDash.hosted")} />
            <Total styles={styles} value={totals.views} label={t("insights.opened")} />
            <Total styles={styles} value={totals.going} label={t("insights.going")} accent />
          </View>
          {/* Said plainly because the figure invites the wrong reading: it is
              sign-ups, so somebody who came to three of your meetings is in it
              three times. */}
          <Text style={styles.hint}>
            {t("hostDash.totalsNote", { fromLink })}
          </Text>
        </View>
      </Appear>

      {/* The one measure of whether sharing is worth doing: a guest has no
          account, so they are exactly the people the link brought in. */}
      {total ? (
        <Appear delay={40}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("insights.whereFromTitle")}</Text>
            <View style={styles.track}>
              <View style={[styles.trackLink, { flex: fromLink }]} />
              <View style={[styles.trackApp, { flex: fromApp }]} />
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
          </View>
        </Appear>
      ) : null}

      {/* No list of meetings here. Every meeting row on the home screen
          carries its own stats button, so repeating them would be a second
          way to the same place — and the longer one. This screen is what is
          true across all of them. */}

      {talking.length ? (
        <Appear delay={140}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("hostDash.messagesTitle")}</Text>
            {talking.map((m) => (
              <Pressable
                key={m.id}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                onPress={() => navigation.navigate("MeetingQuestions", { meetingId: m.id })}
              >
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {m.emoji ? `${m.emoji}  ` : ""}{m.title}
                </Text>
                <Text style={styles.rowCount}>{m.questions}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </Appear>
      ) : null}

      {/* Nothing measured yet is not an error, and a page of zeroes reads as
          one. */}
      {!totals.hosted ? (
        <Text style={styles.empty}>{t("stats.empty")}</Text>
      ) : null}
    </ScrollView>
  );
}

function Total({ styles, value, label, accent }) {
  return (
    <View style={styles.total}>
      <CountUp value={value || 0} style={[styles.totalValue, accent && styles.totalAccent]} />
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },

  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    fontFamily: FONTS.accentMedium,
    fontSize: t.fs(11),
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: t.text3,
    marginBottom: 12,
  },

  totals: { flexDirection: "row", justifyContent: "space-around" },
  total: { alignItems: "center" },
  totalValue: { fontFamily: FONTS.accent, fontSize: t.fs(26), color: t.text },
  totalAccent: { color: t.accent },
  totalLabel: {
    fontFamily: FONTS.accentMedium, fontSize: t.fs(10.5),
    letterSpacing: 0.6, textTransform: "uppercase", color: t.text3, marginTop: 4,
  },
  hint: { fontSize: t.fs(12.5), color: t.text3, marginTop: 12, lineHeight: t.fs(18) },

  track: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", backgroundColor: t.surface2 },
  trackLink: { backgroundColor: t.accent },
  trackApp: { backgroundColor: t.text3 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: t.fs(13), color: t.text2 },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  pressed: { opacity: 0.7 },
  rowTitle: { flex: 1, fontSize: t.fs(14), color: t.text },
  rowFunnel: { fontFamily: FONTS.accent, fontSize: t.fs(14), color: t.text2 },
  rowRate: { fontFamily: FONTS.accent, fontSize: t.fs(13), color: t.accent, minWidth: 44, textAlign: "right" },
  rowCount: { fontFamily: FONTS.accent, fontSize: t.fs(14), color: t.accent },
  chevron: { fontSize: t.fs(18), color: t.text3 },

  empty: { fontSize: t.fs(14), color: t.text2, textAlign: "center", marginTop: 28, lineHeight: t.fs(20) },
});
