import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import { CalendarIcon, ClockIcon } from "./NavIcons";

/** The server stores "YYYY-MM-DD HH:MM", so that is what leaves this field. */
function toServer(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/** Parse the same shape back, so an existing value reopens on the right day. */
function fromServer(value) {
  if (!value) return null;
  const parsed = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu 6 Aug · 12:00" — what a person reads, not what the server stores. */
function humanise(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} · ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/**
 * A tappable date + time field.
 *
 * This replaces a plain text input whose placeholder was the literal string
 * "YYYY-MM-DD HH:MM" — which put the burden of the storage format on whoever
 * was creating the meeting, and silently accepted anything else. The native
 * picker cannot produce an invalid value, so the format stops being the user's
 * problem while the value handed upwards stays exactly what the API expects.
 *
 * Android shows date and time as two separate dialogs, so picking runs as a
 * two-stage sequence; the date chosen in the first stage is carried into the
 * second rather than being committed on its own.
 */
export default function DateTimeField({ value, onChange, placeholder = "Pick a date & time", minimumDate }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // iOS only: the inline component is mounted while this is true.
  const [iosOpen, setIosOpen] = useState(false);

  const selected = fromServer(value);

  /**
   * Android drives the dialogs imperatively.
   *
   * The declarative <DateTimePicker> only opens its dialog when it mounts, so
   * running date-then-time through one mounted element does nothing on the
   * second leg — and forcing a remount with a `key` did not help either. The
   * library's own Android API is a function call per dialog, which makes the
   * two-stage sequence explicit instead of something coaxed out of render.
   */
  const open = useCallback(() => {
    const base = selected || defaultStart();

    if (Platform.OS !== "android") {
      setIosOpen(true);
      return;
    }

    DateTimePickerAndroid.open({
      value: base,
      mode: "date",
      minimumDate,
      onChange: (dateEvent, pickedDate) => {
        if (dateEvent.type !== "set" || !pickedDate) return;   // cancelled

        DateTimePickerAndroid.open({
          value: pickedDate,
          mode: "time",
          is24Hour: true,
          onChange: (timeEvent, pickedTime) => {
            if (timeEvent.type !== "set" || !pickedTime) return;
            const next = new Date(pickedDate);
            next.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
            onChange(toServer(next));
          },
        });
      },
    });
    // `selected` is derived from value, which is in the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, minimumDate, onChange]);

  // iOS shows one combined spinner, so a single pass is the whole answer.
  const handleIosChange = useCallback((event, picked) => {
    setIosOpen(false);
    if (event?.type === "dismissed" || !picked) return;
    onChange(toServer(picked));
  }, [onChange]);

  return (
    <>
      <Pressable style={[styles.field, selected && styles.fieldSet]} onPress={open}>
        <View style={styles.icon}>
          {selected ? <ClockIcon size={18} color={theme.accentStrong} /> : <CalendarIcon size={18} color={theme.text3} />}
        </View>
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? humanise(selected) : placeholder}
        </Text>
        {selected ? <Text style={styles.change}>Change</Text> : null}
      </Pressable>

      {iosOpen ? (
        <DateTimePicker
          value={selected || defaultStart()}
          mode="datetime"
          display="spinner"
          minimumDate={minimumDate}
          onChange={handleIosChange}
        />
      ) : null}
    </>
  );
}

/** Tomorrow at a round hour — a sensible place for the picker to open. */
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return d;
}

const makeStyles = (t) => StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: t.border,
    borderRadius: 10,
    backgroundColor: t.surface2,
    paddingHorizontal: 12,
    paddingVertical: 13,
  },
  fieldSet: { borderColor: t.accent, backgroundColor: t.accentSoft },
  icon: { width: 26 },
  value: { flex: 1, fontSize: 14, color: t.text, fontFamily: FONTS.bodyMedium },
  placeholder: { color: t.text3, fontFamily: FONTS.body },
  change: {
    fontSize: 11,
    fontFamily: FONTS.accent,
    color: t.accentStrong,
    backgroundColor: t.surface,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: "hidden",
  },
});
