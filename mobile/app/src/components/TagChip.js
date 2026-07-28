import React, { useMemo } from "react";
import { Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

// .meeting-card-tag on the web: a quiet chip on the neutral surface, not a
// second accent competing with the Join button.
export default function TagChip({ label }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return <Text style={styles.chip}>{label}</Text>;
}

const makeStyles = (t) => StyleSheet.create({
  chip: {
    fontSize: 10,
    fontWeight: "600",
    color: t.text2,
    backgroundColor: t.surface2,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 5,
    marginBottom: 5,
    overflow: "hidden",
  },
});
