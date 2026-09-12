import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { api } from "../api";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import { formatWhen } from "../utils/time";

/**
 * What an organiser needs to see first: their own meetings, and whether each
 * one is actually going to happen.
 *
 * Shown only to someone who said they came here to organise. For everyone else
 * the app is unchanged — the answer steers what is put in front of people, it
 * does not gate anything.
 *
 * The three things worth surfacing per meeting are the ones an organiser would
 * otherwise have to open each meeting to find: how many are coming, whether
 * that clears the minimum they set, and whether it is still waiting on review.
 * A pending meeting is included here precisely because the public listings
 * hide it — "where did my meeting go" is otherwise unanswerable from Home.
 */
export default function HostingPanel({ onOpen, onCreate }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [rows, setRows] = useState([]);
  // Nothing is drawn until the first answer lands, so the empty prompt cannot
  // flash at an organiser who does have meetings.
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      api.getHosting()
        .then((list) => { if (alive) setRows(Array.isArray(list) ? list : []); })
        .catch(() => { if (alive) setRows([]); })
        .finally(() => { if (alive) setLoaded(true); });
      return () => { alive = false; };
    }, [])
  );

  if (!loaded) return null;

  // An organiser with nothing yet still gets the panel. Rendering nothing was
  // worse than useless: choosing "I am here to organise" then changed exactly
  // nothing on screen, which reads as the choice not having saved.
  if (!rows.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t("hosting.emptyTitle")}</Text>
        <Text style={styles.emptyBody}>{t("hosting.emptyBody")}</Text>
        <Pressable style={styles.cta} onPress={onCreate}>
          <Text style={styles.ctaText}>{t("hosting.create")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("hosting.title", { n: rows.length })}</Text>

      {rows.map((m) => {
        const going = m.joined_count || 0;
        const needed = m.min_attendees || 0;
        const short = needed ? Math.max(0, needed - going) : 0;
        const pending = m.status === "pending";

        return (
          <Pressable key={m.id} style={styles.row} onPress={() => onOpen?.(m)}>
            <Text style={styles.emoji}>{m.emoji || "📍"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{m.title}</Text>
              <Text style={styles.when} numberOfLines={1}>{formatWhen(m.time)}</Text>
            </View>

            {/* One status per row, in priority order: still under review beats
                anything about numbers, because until it is approved nobody can
                join it at all. */}
            {pending ? (
              <Text style={[styles.pill, styles.pillWait]}>{t("hosting.pending")}</Text>
            ) : needed && short > 0 ? (
              <Text style={[styles.pill, styles.pillShort]}>
                {t("hosting.needsMore", { n: short })}
              </Text>
            ) : needed ? (
              <Text style={[styles.pill, styles.pillOk]}>{t("hosting.confirmed")}</Text>
            ) : (
              <Text style={[styles.pill, styles.pillPlain]}>
                {t("hosting.going", { n: going })}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  card: {
    backgroundColor: t.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: t.border, padding: 14, marginBottom: 16,
  },
  title: {
    fontSize: 11, fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", marginBottom: 10,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  emoji: { fontSize: 22 },
  rowTitle: { fontSize: 14.5, fontFamily: FONTS.bodySemi, color: t.text },
  when: { fontSize: 12, color: t.text3, fontFamily: FONTS.body, marginTop: 2 },
  pill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill,
    fontSize: 11.5, fontFamily: FONTS.bodySemi, overflow: "hidden",
  },
  pillWait: { color: t.status.warn, backgroundColor: t.status.warnSoft },
  pillShort: { color: t.status.bad, backgroundColor: t.status.badSoft },
  pillOk: { color: t.status.good, backgroundColor: t.status.goodSoft },
  pillPlain: { color: t.text2, backgroundColor: t.surface2 },
  emptyBody: { fontSize: 13.5, color: t.text2, fontFamily: FONTS.body, lineHeight: 19 },
  cta: {
    marginTop: 12, backgroundColor: t.accent, borderRadius: RADIUS.md,
    paddingVertical: 12, alignItems: "center",
  },
  ctaText: { color: "#fff", fontSize: 14.5, fontFamily: FONTS.accent },
});
