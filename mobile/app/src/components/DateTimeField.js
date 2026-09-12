import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import { CalendarIcon, ClockIcon } from "./NavIcons";
import DateTimeSheet from "./DateTimeSheet";
import { dayName, monthName } from "../utils/time";
import { useI18n } from "../context/LocaleContext";

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

/** "Thu 6 Aug · 12:00" — what a person reads, not what the server stores.
 *  Day and month names come from utils/time so this field and the meeting
 *  cards never disagree about how a date is spelled. */
function humanise(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${dayName(date.getDay())} ${date.getDate()} ${monthName(date.getMonth())} · ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/**
 * A tappable date + time field.
 *
 * This replaces a plain text input whose placeholder was the literal string
 * "YYYY-MM-DD HH:MM" — which put the burden of the storage format on whoever
 * was creating the meeting, and silently accepted anything else. The picker
 * cannot produce an invalid value, so the format stops being the user's
 * problem while the value handed upwards stays exactly what the API expects.
 *
 * The picker itself is DateTimeSheet, drawn by the app. The platform dialog it
 * replaced was stock Material in the middle of a themed screen, spoke the OS
 * language rather than the one chosen in Settings, and asked for the day and
 * the time in two separate popups.
 */
export default function DateTimeField({ value, onChange, placeholder, minimumDate }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [open, setOpen] = useState(false);

  const selected = fromServer(value);

  return (
    <>
      <Pressable style={[styles.field, selected && styles.fieldSet]} onPress={() => setOpen(true)}>
        <View style={styles.icon}>
          {selected ? <ClockIcon size={18} color={theme.accentStrong} /> : <CalendarIcon size={18} color={theme.text3} />}
        </View>
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? humanise(selected) : (placeholder || t("create.pickDateTime"))}
        </Text>
        {selected ? <Text style={styles.change}>Change</Text> : null}
      </Pressable>

      <DateTimeSheet
        visible={open}
        initial={selected || defaultStart()}
        minimumDate={minimumDate}
        onCancel={() => setOpen(false)}
        onConfirm={(picked) => {
          setOpen(false);
          onChange(toServer(picked));
        }}
      />
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
