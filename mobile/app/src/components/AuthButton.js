import React, { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AnimatedPressable from "./AnimatedPressable";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";

export default function AuthButton({ label, onPress, loading, disabled }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <AnimatedPressable onPress={onPress} disabled={disabled || loading}>
      <LinearGradient colors={[theme.accent, theme.accentStrong]} style={styles.button}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.label}>{label}</Text>}
      </LinearGradient>
    </AnimatedPressable>
  );
}

const makeStyles = (t) => StyleSheet.create({
  button: {
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 6,
    shadowColor: t.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  label: { color: "#fff", fontFamily: FONTS.accent, fontSize: 16, letterSpacing: 0.3 },
});
