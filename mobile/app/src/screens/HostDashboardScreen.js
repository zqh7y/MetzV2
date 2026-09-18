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
import { ShareButton } from "../components/ShareLink";

/**
 * Everything you have run, in one place.
 *
 * The per-meeting screen answers "how is this one doing". This answers the
 * question above it — whether organising is working at all — which no screen
 * did: an organiser had to open each meeting in turn and hold the numbers in
 * their head to compare them.
 *
 * Past meetings are kept, unlike the panel on Home, which is about what still
 * needs attention. A record of what you have run is the point here, and
 * dropping what already happened would leave most organisers on an empty page.
 *
 * Every row opens the full figures for that meeting; the totals and the rows
 * come from the same meeting_insights() the other screen uses, so the two can
 * never disagree.
 */
export default function HostDashboardScreen({ navigation }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    api.getHostDashboard()
      .then(setData)
      .catch(() => setFailed(true))
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

  const totals = data.totals || {};
  const meetings = data.meetings || [];

  // Nothing hosted is not a broken screen, and saying so beats a page of
  // zeroes that reads as a figure rather than as an absence.
  if (!meetings.length) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>{t("hostDash.emptyTitle")}</Text>
        <Text style={styles.emptyBody}>{t("hostDash.emptyBody")}</Text>
        <Pressable style={styles.retryBtn} onPress={() => navigation.navigate("Create")}>
          <Text style={styles.retryBtnText}>{t("drawer.create")}</Text>
        </Pressable>
      </View>
    );
  }

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
            {t("hostDash.totalsNote", { fromLink: totals.from_link || 0 })}
          </Text>
        </View>
      </Appear>

      {/* Only when there is something to act on — a row of zeroes telling an
          organiser nothing is waiting is noise. */}
      {totals.pending || totals.questions ? (
        <Appear delay={40}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("insights.youTitle")}</Text>
            {totals.pending ? (
              <Text style={styles.line}>{t("hostDash.pendingLine", { count: totals.pending })}</Text>
            ) : null}
            {totals.questions ? (
              <Text style={styles.line}>{t("hostDash.questionsLine", { count: totals.questions })}</Text>
            ) : null}
          </View>
        </Appear>
      ) : null}

      <Text style={styles.sectionLabel}>
        {t("hostDash.allMeetings", { count: meetings.length })}
      </Text>

      {meetings.map((m, i) => (
        <Appear key={m.id} delay={80 + i * 30}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => navigation.navigate("MeetingInsights", { meetingId: m.id })}
          >
            <View style={styles.rowHead}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {m.emoji ? `${m.emoji}  ` : ""}{m.title}
              </Text>
              {m.status === "pending" ? (
                <Text style={styles.badge}>{t("hostDash.inReview")}</Text>
              ) : m.is_over ? (
                <Text style={[styles.badge, styles.badgeQuiet]}>{t("hostDash.over")}</Text>
              ) : null}
            </View>
            <Text style={styles.rowWhen}>{formatWhen(m.time)}</Text>
            <View style={styles.rowStats}>
              <Stat styles={styles} value={m.views} label={t("hostDash.opens")} />
              <Stat styles={styles} value={m.going} label={t("hostDash.names")} />
              <Stat styles={styles} value={m.from_link} label={t("hostDash.viaLink")} />
              {/* On the row rather than only inside, because "send this to a
                  few more people" is the commonest thing to want from a list
                  of your meetings, and it was three taps away. */}
              <ShareButton shareUrl={m.share_url} meetingId={m.id} title={m.title} style={styles.rowShare} />
            </View>
          </Pressable>
        </Appear>
      ))}
    </ScrollView>
  );
}

function Total({ styles, value, label, accent }) {
  return (
    <View style={styles.total}>
      <CountUp value={value || 0} style={[styles.totalValue, accent && styles.totalValueOn]} />
      <Text style={styles.totalLabel}>{label}</Text>
    </View>
  );
}

function Stat({ styles, value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value || 0}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: t.bg, paddingHorizontal: 32,
  },
  errorText: { color: t.text2, fontSize: t.fs(14), marginBottom: 14 },
  emptyTitle: { fontSize: t.fs(17), fontFamily: FONTS.heading, color: t.text, textAlign: "center" },
  emptyBody: {
    fontSize: t.fs(14), color: t.text3, textAlign: "center",
    marginTop: 8, marginBottom: 18, lineHeight: 21,
  },
  retryBtn: {
    backgroundColor: t.accent, borderRadius: RADIUS.pill,
    paddingVertical: 12, paddingHorizontal: 26,
  },
  retryBtnText: { color: t.accentOn, fontFamily: FONTS.accentMedium },

  card: {
    backgroundColor: t.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: t.border, padding: 16, marginBottom: 14, ...SHADOW.s1,
  },
  cardTitle: {
    fontSize: t.fs(11), fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginBottom: 12,
  },
  totals: { flexDirection: "row" },
  total: { flex: 1, alignItems: "center" },
  totalValue: { fontFamily: FONTS.accent, fontSize: t.fs(30), color: t.text },
  totalValueOn: { color: t.accent },
  totalLabel: {
    fontSize: t.fs(10), fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginTop: 3, textAlign: "center",
  },
  hint: { fontSize: t.fs(12.5), color: t.text3, marginTop: 12, lineHeight: 18 },
  line: { fontSize: t.fs(14), color: t.text2, paddingVertical: 3 },

  sectionLabel: {
    fontSize: t.fs(11), fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginBottom: 10, marginTop: 4,
  },

  row: {
    backgroundColor: t.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: t.border, padding: 14, marginBottom: 10, ...SHADOW.s1,
  },
  rowPressed: { backgroundColor: t.surface2 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { flex: 1, fontSize: t.fs(15), fontFamily: FONTS.bodySemi, color: t.text },
  badge: {
    fontSize: t.fs(10), fontFamily: FONTS.bodySemi, overflow: "hidden",
    color: t.status.warn, backgroundColor: t.status.warnSoft,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.pill,
  },
  badgeQuiet: { color: t.text3, backgroundColor: t.surface2 },
  rowWhen: { fontSize: t.fs(12.5), color: t.text3, marginTop: 3 },
  rowStats: { flexDirection: "row", marginTop: 12, gap: 22 },
  rowShare: { marginStart: "auto" },
  stat: { flexDirection: "row", alignItems: "baseline", gap: 5 },
  statValue: { fontFamily: FONTS.accent, fontSize: t.fs(16), color: t.text },
  statLabel: { fontSize: t.fs(11), color: t.text3 },
});
