import React from "react";
import { View, Text, StyleSheet } from "react-native";

// Mirrors the web's .meeting-marker-circle (emoji bubble with a pointer tail).
export default function MapMarkerIcon({ emoji = "📍" }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.circle}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <View style={styles.tail} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  circle: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: "#fff",
    borderWidth: 2, borderColor: "#667eea", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  emoji: { fontSize: 17 },
  tail: {
    width: 0, height: 0, marginTop: -2,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 6,
    borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#667eea",
  },
});
