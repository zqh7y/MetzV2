import React from "react";
import { Text, TextInput, View, StyleSheet } from "react-native";

export default function AuthField({ label, ...inputProps }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#9aa3ad" {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#555", marginBottom: 6 },
  input: {
    width: "100%", paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
    borderWidth: 1.5, borderColor: "rgba(220,225,231,0.8)", borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.6)", color: "#2c3e50",
  },
});
