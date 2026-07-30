import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";

// The scoring in auth_base.html's inline script. Advisory only — the server is
// still what enforces the real rules — so this stays a straight transcription
// rather than a stricter check that would disagree with the web.
export function scorePassword(v) {
  if (!v) return 0;
  let score = 0;
  if (v.length >= 8) score++;
  if (v.length >= 12) score++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
  return Math.max(1, Math.min(4, score));
}

const WORDS = ["", "Weak", "Fair", "Good", "Strong"];
// .auth-strength[data-level="N"] .auth-strength-fill
const LEVELS = {
  1: { width: "25%", color: "#e74c3c" },
  2: { width: "50%", color: "#e0a51a" },
  3: { width: "75%", color: "#3fa96b" },
  4: { width: "100%", color: "#0f7b5f" },
};

/** .auth-strength — reserves its own line so the button never jumps. */
export default function AuthStrength({ value }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const level = scorePassword(value);
  const fill = LEVELS[level];

  return (
    <View style={styles.row}>
      <View style={styles.track}>
        {fill ? <View style={[styles.fill, { width: fill.width, backgroundColor: fill.color }]} /> : null}
      </View>
      <Text style={styles.label}>{WORDS[level]}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginTop: 9, minHeight: 16 },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: t.surface3,
    overflow: "hidden",
    marginRight: 9,
  },
  fill: { height: "100%", borderRadius: 3 },
  label: {
    fontSize: 11.5,
    fontFamily: FONTS.bodySemi,
    color: t.text3,
    // min-width: 6ch, so "Strong" and "" hold the same slot.
    minWidth: 42,
  },
});
