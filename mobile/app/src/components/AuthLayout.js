import React from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { FONTS } from "../styles/fonts";

// Mirrors the web app's .auth-page / .container styling (styles/style.css)
// so login/signup look the same on web and mobile.
export default function AuthLayout({ title, subtitle, error, children, footer }) {
  return (
    <LinearGradient
      colors={["#667eea", "#764ba2", "#f093fb", "#f5576c", "#4facfe", "#43e97b", "#38f9d7", "#fee140"]}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={styles.page}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <BlurView intensity={40} tint="light" style={styles.card}>
            <View style={styles.brand}>
              <LinearGradient colors={["#667eea", "#764ba2"]} style={styles.brandLogo}>
                <Text style={styles.brandLogoText}>M</Text>
              </LinearGradient>
              <Text style={styles.brandName}>METZ</Text>
            </View>

            <Text style={styles.heading}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            {error ? <Text style={styles.error}>⚠ {error}</Text> : null}

            {children}

            {footer}
          </BlurView>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    backgroundColor: "rgba(255,255,255,0.55)",
    padding: 32,
    overflow: "hidden",
    shadowColor: "#1f2687",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  brand: { alignItems: "center", marginBottom: 18 },
  brandLogo: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  brandLogoText: { color: "#fff", fontSize: 24, fontFamily: FONTS.heading },
  brandName: { fontSize: 15, fontFamily: FONTS.heading, letterSpacing: 1.5, color: "#2c3e50" },
  heading: {
    textAlign: "center", fontSize: 26, fontFamily: FONTS.heading, color: "#667eea", marginBottom: 6,
  },
  subtitle: { textAlign: "center", color: "#888", fontSize: 13.5, marginBottom: 22 },
  error: {
    color: "#c0392b", backgroundColor: "#fdecea", borderColor: "#f5c6cb", borderWidth: 1,
    borderLeftColor: "#e74c3c", borderLeftWidth: 4, borderRadius: 8, padding: 12,
    marginBottom: 16, fontSize: 13.5, fontWeight: "600",
  },
});
