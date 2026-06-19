import React from "react";
import { Text, StyleSheet } from "react-native";

export default function TagChip({ label }) {
  return <Text style={styles.chip}>{label}</Text>;
}

const styles = StyleSheet.create({
  chip: {
    fontSize: 10,
    fontWeight: "600",
    color: "#764ba2",
    backgroundColor: "#f0ebff",
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginRight: 5,
    marginBottom: 5,
    overflow: "hidden",
  },
});
