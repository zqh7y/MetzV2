import React from "react";
import { Text, StyleSheet, View } from "react-native";

/**
 * The ★ marking a trusted user.
 *
 * Deliberately static, unlike the web's cycling-colour version.
 *
 * On the web that cycle is a CSS animation the compositor runs for free. In
 * React Native it was an `Animated.loop` per badge — and a badge sits on every
 * meeting card, so a list ran ten at once. It also used
 * `useNativeDriver: false` (backgroundColor is not native-drivable) and never
 * stopped on unmount, so scrolling left loops running for the life of the
 * process.
 *
 * Moving it to the native driver removed the JS cost but not the real one: an
 * animation that never ends means the screen never stops redrawing, so the app
 * could never go idle and every real interaction competed with it. Measured on
 * the emulator, a still Home screen was repainting ~15fps doing nothing.
 *
 * A gold star reads as "trusted" without any of that. The colour cycle is the
 * one piece of web parity given up on purpose, for the thing that was asked
 * for — an app that responds immediately.
 */
const GOLD = "#f5b81c";

export default function TrustBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.star}>★</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GOLD,
  },
  star: { color: "#fff", fontSize: 9, fontWeight: "800" },
});
