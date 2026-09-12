import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal, ScrollView, Animated, Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import { dayName, monthName } from "../utils/time";

/**
 * The date and time picker, drawn by the app instead of by Android.
 *
 * The platform dialog was the one piece of this screen that looked like a
 * different app: stock Material on a page that is otherwise all rounded cards
 * and the brand's green, in whatever the OS language is rather than the one
 * the user picked here. It also took two separate dialogs to answer one
 * question, so choosing a day and a time meant two round trips.
 *
 * Not a library, on purpose. `react-native-modal-datetime-picker` wraps the
 * same native dialog, so it would not change how any of this looks, and a
 * calendar package would add a native dependency — which Expo Go cannot load
 * without a fresh build. This is plain views, so it themes like everything
 * else and keeps `expo start` working.
 *
 * Times are 24-hour and minutes step by five: a meeting at 18:37 is not a
 * thing anyone arranges, and the coarser step makes the column short enough to
 * pick from without scrolling past sixty rows.
 */
const MINUTE_STEP = 5;
const ROW = 44;

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** The Monday-first grid for a month, padded so weekdays line up in columns. */
function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-first; the app's week starts on Monday.
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array(lead).fill(null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}

export default function DateTimeSheet({ visible, initial, minimumDate, onCancel, onConfirm }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [draft, setDraft] = useState(initial);
  const [cursor, setCursor] = useState(() => new Date(initial));
  const hourRef = useRef(null);
  const minuteRef = useRef(null);
  const slide = useRef(new Animated.Value(0)).current;

  // Reopening starts from whatever is on the field now, not from wherever the
  // sheet was left the last time it was closed.
  useEffect(() => {
    if (!visible) return;
    setDraft(initial);
    setCursor(new Date(initial));
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [visible, initial, slide]);

  // Both columns open on the current value rather than at midnight, which
  // otherwise means scrolling most of the way down every single time.
  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => {
      hourRef.current?.scrollTo({ y: draft.getHours() * ROW, animated: false });
      minuteRef.current?.scrollTo({ y: (draft.getMinutes() / MINUTE_STEP) * ROW, animated: false });
    }, 60);
    return () => clearTimeout(id);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const min = minimumDate ? startOfDay(minimumDate) : null;
  const cells = useMemo(
    () => monthGrid(cursor.getFullYear(), cursor.getMonth()),
    [cursor]
  );

  function pickDay(day) {
    const next = new Date(day);
    next.setHours(draft.getHours(), draft.getMinutes(), 0, 0);
    setDraft(next);
  }

  function setTime(h, m) {
    const next = new Date(draft);
    next.setHours(h, m, 0, 0);
    setDraft(next);
  }

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);
  const pad = (n) => String(n).padStart(2, "0");

  // A day before the minimum cannot be chosen, and neither can a time earlier
  // today than the minimum — otherwise the field would hand the server a
  // meeting in the past and let the API be the one to say no.
  const tooEarly = minimumDate && draft < minimumDate;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel}>
        {/* Stops a tap inside the sheet closing it. */}
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + 16 },
              {
                opacity: slide,
                transform: [{
                  translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }),
                }],
              },
            ]}
          >
            <View style={styles.grabber} />

            <View style={styles.monthRow}>
              <Pressable
                hitSlop={12}
                style={styles.arrow}
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              >
                <Text style={styles.arrowText}>‹</Text>
              </Pressable>
              <Text style={styles.monthLabel}>
                {monthName(cursor.getMonth())} {cursor.getFullYear()}
              </Text>
              <Pressable
                hitSlop={12}
                style={styles.arrow}
                onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              >
                <Text style={styles.arrowText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <Text key={d} style={styles.weekday}>{dayName(d).slice(0, 2)}</Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (!day) return <View key={`pad${i}`} style={styles.cell} />;
                const disabled = min && startOfDay(day) < min;
                const on = startOfDay(day).getTime() === startOfDay(draft).getTime();
                return (
                  <Pressable
                    key={day.toISOString()}
                    style={styles.cell}
                    disabled={disabled}
                    onPress={() => pickDay(day)}
                  >
                    <View style={[styles.dayDot, on && styles.dayDotOn]}>
                      <Text style={[
                        styles.dayText,
                        disabled && styles.dayTextOff,
                        on && styles.dayTextOn,
                      ]}>
                        {day.getDate()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.timeRow}>
              <Text style={styles.timeLabel}>{t("create.timeLabel")}</Text>
              <Text style={styles.timeValue}>{pad(draft.getHours())}:{pad(draft.getMinutes())}</Text>
            </View>

            <View style={styles.columns}>
              <ScrollView
                ref={hourRef}
                style={styles.column}
                showsVerticalScrollIndicator={false}
                snapToInterval={ROW}
                decelerationRate="fast"
              >
                {hours.map((h) => (
                  <Pressable key={h} style={styles.slot} onPress={() => setTime(h, draft.getMinutes())}>
                    <Text style={[styles.slotText, h === draft.getHours() && styles.slotTextOn]}>
                      {pad(h)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.colon}>:</Text>
              <ScrollView
                ref={minuteRef}
                style={styles.column}
                showsVerticalScrollIndicator={false}
                snapToInterval={ROW}
                decelerationRate="fast"
              >
                {minutes.map((m) => (
                  <Pressable key={m} style={styles.slot} onPress={() => setTime(draft.getHours(), m)}>
                    <Text style={[styles.slotText, m === draft.getMinutes() && styles.slotTextOn]}>
                      {pad(m)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {tooEarly ? <Text style={styles.warn}>{t("create.timeInPast")}</Text> : null}

            <View style={styles.actions}>
              <Pressable style={styles.cancel} onPress={onCancel}>
                <Text style={styles.cancelText}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                style={[styles.confirm, tooEarly && styles.confirmOff]}
                disabled={!!tooEarly}
                onPress={() => onConfirm(draft)}
              >
                <Text style={styles.confirmText}>{t("common.done")}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheetWrap: { width: "100%" },
  sheet: {
    backgroundColor: t.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 10,
  },
  grabber: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: t.border,
    alignSelf: "center", marginBottom: 14,
  },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  arrow: {
    width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center",
    backgroundColor: t.surface2,
  },
  arrowText: { fontSize: 22, color: t.text, fontFamily: FONTS.accent, lineHeight: 26 },
  monthLabel: { fontSize: 16, fontFamily: FONTS.heading, color: t.text },
  weekRow: { flexDirection: "row", marginTop: 14, marginBottom: 4 },
  weekday: {
    flex: 1, textAlign: "center", fontSize: 11, color: t.text3,
    fontFamily: FONTS.bodySemi, textTransform: "uppercase",
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, alignItems: "center", paddingVertical: 3 },
  dayDot: {
    width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center",
    // Transparent rather than absent. On Android a background added to a view
    // *after* it has mounted builds its drawable without the corner radius, so
    // the selected day rendered as a circle on first paint and as a hard square
    // every time the selection moved. Declaring the colour up front means the
    // rounded drawable already exists and only its tint changes.
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  dayDotOn: { backgroundColor: t.accent },
  dayText: { fontSize: 14, color: t.text, fontFamily: FONTS.bodyMedium },
  dayTextOff: { color: t.text3, opacity: 0.4 },
  dayTextOn: { color: "#fff", fontFamily: FONTS.accent },
  timeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 16, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14,
  },
  timeLabel: { fontSize: 11, color: t.text3, fontFamily: FONTS.bodySemi, textTransform: "uppercase" },
  timeValue: { fontSize: 20, color: t.text, fontFamily: FONTS.accent },
  columns: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 },
  column: { height: ROW * 3, width: 78 },
  colon: { fontSize: 20, color: t.text3, fontFamily: FONTS.accent },
  slot: { height: ROW, alignItems: "center", justifyContent: "center" },
  slotText: { fontSize: 17, color: t.text2, fontFamily: FONTS.bodyMedium },
  slotTextOn: { color: t.accentStrong, fontFamily: FONTS.accent, fontSize: 19 },
  warn: { marginTop: 10, fontSize: 12, color: t.status.bad, fontFamily: FONTS.bodyMedium, textAlign: "center" },
  actions: { flexDirection: "row", gap: 12, marginTop: 16 },
  cancel: {
    flex: 1, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: "center",
    backgroundColor: t.surface2,
  },
  cancelText: { fontSize: 15, fontFamily: FONTS.bodySemi, color: t.text2 },
  confirm: {
    flex: 2, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: "center",
    backgroundColor: t.accent,
  },
  confirmOff: { opacity: 0.45 },
  confirmText: { fontSize: 15, fontFamily: FONTS.accent, color: "#fff" },
});
