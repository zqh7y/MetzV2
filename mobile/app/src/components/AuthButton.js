import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AnimatedPressable from "./AnimatedPressable";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";

/**
 * .auth-submit. The web swaps the label for `data-busy` and disables the
 * button on submit rather than showing a spinner, so `busyLabel` does the
 * same here — a spinner would read as a different control mid-flow.
 */
export default function AuthButton({ label, busyLabel, onPress, loading, disabled }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const inert = disabled || loading;

  return (
    <AnimatedPressable onPress={onPress} disabled={inert} scaleTo={0.985}>
      <LinearGradient
        colors={[theme.accent, theme.accentStrong]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.button, inert && styles.buttonInert]}
      >
        <Text style={styles.label}>{loading ? (busyLabel || label) : label}</Text>
      </LinearGradient>
    </AnimatedPressable>
  );
}

const makeStyles = (t) => StyleSheet.create({
  button: {
    marginTop: 4,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: t.accent,
    shadowOpacity: 0.38,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  buttonInert: { opacity: 0.65 },
  label: {
    color: "#fff",
    fontFamily: FONTS.accent,
    fontSize: 15.5,
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
});
