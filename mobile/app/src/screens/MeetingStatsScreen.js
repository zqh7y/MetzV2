import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { api } from "../api";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import Appear from "../components/Appear";
import CountUp from "../components/CountUp";
import FaceAvatar from "../components/FaceAvatar";
import { formatWhen, parseTime } from "../utils/time";

/**
 * One meeting, by the numbers.
 *
 * Four figures and a list of names, which is the whole of what an organiser
 * wants from "how is this one doing" — and deliberately nothing else. The map,
 * the link and the buttons that change the meeting live on its own page; this
 * is the reading, not the running.
 */

/**
 * "2d 3h" rather than "2 days and 3 hours left".
 *
 * A tile has room for a value and a label, not a sentence, and the sentence
 * version already exists for the places that have the width for it. Hours are
 * dropped past a week — nobody plans around the hour nine days out — and
 * minutes only appear in the last hour, when they are the only thing anybody
 * is looking at.
 */
function countdown(timeStr, t) {
  const target = parseTime(timeStr);
  if (!target) return "—";
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return t("stats.started");

  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);

  if (days >= 7) return t("stats.inDays", { count: days });
  if (days > 0) return `${t("stats.dShort", { count: days })} ${t("stats.hShort", { count: hours })}`;
  if (hours > 0) return `${t("stats.hShort", { count: hours })} ${t("stats.mShort", { count: minutes % 60 })}`;
  return t("stats.mShort", { count: minutes });
}

export default function MeetingStatsScreen({ route, navigation }) {
  const meetingId = route?.params?.meetingId;
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    api.getMeetingInsights(meetingId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [meetingId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>{t("insights.loadFailed")}</Text>
      </View>
    );
  }

  const people = data.attendees || [];

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
      <Text style={styles.title} numberOfLines={2}>
        {data.emoji ? `${data.emoji}  ` : ""}{data.title}
      </Text>
      <Text style={styles.when}>{formatWhen(data.time)}</Text>

      {/* Four tiles, two by two. A row of four on a phone gives each of them
          about forty pixels, which is not enough for a number and a word. */}
      <Appear offset={-4}>
        <View style={styles.grid}>
          <Tile styles={styles} value={data.views} label={t("stats.watched")} />
          <Tile styles={styles} value={data.going} label={t("stats.signedUp")} accent />
          <Tile styles={styles} value={data.from_link} label={t("hostDash.viaLink")} />
          <Tile
            styles={styles}
            text={data.is_over ? t("hostDash.over") : countdown(data.time, t)}
            label={t("stats.untilItStarts")}
          />
        </View>
      </Appear>

      {/* The names, last, because a count answers "is this working" and a list
          answers "who is it" — and the second question only gets asked once
          the first has a number worth reading. */}
      <Appear delay={60}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("insights.goingTitle")}</Text>
          {people.length ? (
            people.map((p, i) => (
              <View key={`${p.name}-${i}`} style={styles.person}>
                {p.avatar_face ? (
                  <FaceAvatar id={p.avatar_face} size={28} />
                ) : (
                  <View style={[styles.dot, { backgroundColor: p.color }]}>
                    <Text style={styles.initial}>{p.initial}</Text>
                  </View>
                )}
                <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                {/* Somebody who came through the link has a name and nothing
                    else — no account, and no way to be sent a notification. */}
                {p.via_link ? <Text style={styles.viaLink}>{t("insights.viaLink")}</Text> : null}
              </View>
            ))
          ) : (
            <Text style={styles.empty}>{t("stats.nobodyYet")}</Text>
          )}
        </View>
      </Appear>
    </ScrollView>
  );
}

function Tile({ styles, value, text, label, accent }) {
  return (
    <View style={styles.tile}>
      {text === undefined ? (
        <CountUp value={value || 0} style={[styles.tileValue, accent && styles.tileAccent]} />
      ) : (
        <Text style={[styles.tileValue, styles.tileText, accent && styles.tileAccent]} numberOfLines={1}>
          {text}
        </Text>
      )}
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg, padding: 24 },

  title: { fontFamily: FONTS.heading, fontSize: t.fs(21), color: t.text, letterSpacing: -0.2 },
  when: { fontSize: t.fs(14), color: t.text2, marginTop: 4, marginBottom: 16 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 14 },
  tile: {
    // Two per row, whatever the screen: half the width less half the gap.
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  tileValue: { fontFamily: FONTS.accent, fontSize: t.fs(28), color: t.text },
  tileText: { fontSize: t.fs(22) },
  tileAccent: { color: t.accent },
  tileLabel: {
    fontFamily: FONTS.accentMedium, fontSize: t.fs(10.5),
    letterSpacing: 0.6, textTransform: "uppercase",
    color: t.text3, marginTop: 6, textAlign: "center",
  },

  card: { backgroundColor: t.surface, borderRadius: RADIUS.lg, padding: 16 },
  cardTitle: {
    fontFamily: FONTS.accentMedium, fontSize: t.fs(11),
    letterSpacing: 1.1, textTransform: "uppercase", color: t.text3, marginBottom: 6,
  },
  person: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  initial: { fontFamily: FONTS.accent, fontSize: t.fs(12), color: "#fff" },
  name: { flex: 1, fontSize: t.fs(14), color: t.text },
  viaLink: {
    fontFamily: FONTS.accentMedium, fontSize: t.fs(10.5),
    letterSpacing: 0.4, textTransform: "uppercase",
    color: t.text3, backgroundColor: t.surface2,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.pill, overflow: "hidden",
  },
  empty: { fontSize: t.fs(14), color: t.text2, textAlign: "center", paddingVertical: 12 },
});
