import React, { useMemo } from "react";
import { Text, TextInput, View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

export default function AuthField({ label, ...inputProps }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={theme.text3} {...inputProps} />
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  group: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: t.text2, marginBottom: 6 },
  input: {
    width: "100%",
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: t.scheme === "dark" ? "rgba(255,255,255,0.12)" : "rgba(220,225,231,0.8)",
    borderRadius: 10,
    backgroundColor: t.scheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.6)",
    color: t.text,
  },
});
