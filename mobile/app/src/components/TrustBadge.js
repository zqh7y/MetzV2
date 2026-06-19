import React, { useEffect, useRef } from "react";
import { Animated, Text, StyleSheet } from "react-native";

// Mirrors the web app's cycling-color ★ badge next to trusted users' names.
const COLORS = ["#ff6b6b", "#f7d716", "#4ade80", "#38bdf8", "#a78bfa", "#ff6b6b"];

export default function TrustBadge() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 5000,
        useNativeDriver: false,
      })
    ).start();
  }, [anim]);

  const backgroundColor = anim.interpolate({
    inputRange: COLORS.map((_, i) => i / (COLORS.length - 1)),
    outputRange: COLORS,
  });

  return (
    <Animated.View style={[styles.badge, { backgroundColor }]}>
      <Text style={styles.star}>★</Text>
    </Animated.View>
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
  },
  star: { color: "#fff", fontSize: 9, fontWeight: "800" },
});
