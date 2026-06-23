import React from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AnimatedPressable from "./AnimatedPressable";
import { FONTS } from "../styles/fonts";

export default function AuthButton({ label, onPress, loading, disabled }) {
  return (
    <AnimatedPressable onPress={onPress} disabled={disabled || loading}>
      <LinearGradient colors={["#667eea", "#764ba2"]} style={styles.button}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.label}>{label}</Text>}
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 6,
    shadowColor: "#667eea", shadowOpacity: 0.35, shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  label: { color: "#fff", fontFamily: FONTS.accent, fontSize: 16, letterSpacing: 0.3 },
});
