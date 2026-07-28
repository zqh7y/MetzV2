import React, { useEffect, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Animated,
  useWindowDimensions, Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";

// Mirrors .auth-page / .auth-card in static/style.css. The web paints an
// eight-stop gradient at 400% size and drifts it with the gradientFlow
// keyframes; here the same stops sit on an oversized layer that slides, which
// is the closest a native gradient gets to an animated background-position.
export default function AuthLayout({ title, subtitle, error, children, footer }) {
  const { theme, scheme, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width: screenW, height: screenH } = useWindowDimensions();

  // The web sets background-size: 400% and slides background-position across
  // it, so the visible window only ever shows part of the ramp and the colours
  // change completely as it travels. A native gradient can't animate its
  // position, so the layer itself is oversized and slid instead.
  //
  // The stretch is mostly horizontal on purpose: phones are tall, and scaling
  // both axes by 2 puts the layer past the 4096px texture limit a lot of GPUs
  // enforce, which drops the gradient entirely. Widening instead keeps it well
  // inside that budget while still traversing a good stretch of the ramp,
  // which runs corner to corner anyway.
  const LAYER_X = 2;
  const LAYER_Y = 1.25;
  const travelX = screenW * (LAYER_X - 1);
  const travelY = screenH * (LAYER_Y - 1);

  const drift = useRef(new Animated.Value(0)).current;
  const cardIn = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      drift.setValue(0);
      cardIn.setValue(1);
      return undefined;
    }

    // 20s round trip, matching `animation: gradientFlow 20s ease infinite`.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1, duration: 10000, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0, duration: 10000, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    // .auth-page .container: authCardIn 0.6s cubic-bezier(0.4, 0, 0.2, 1)
    Animated.timing(cardIn, {
      toValue: 1,
      duration: 600,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();

    return () => loop.stop();
  }, [drift, cardIn, reduceMotion]);

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -travelX] });
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -travelY] });

  const cardStyle = {
    opacity: cardIn,
    transform: [
      { translateY: cardIn.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
      { scale: cardIn.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
    ],
  };

  return (
    <View style={styles.page}>
      <Animated.View
        style={[
          styles.gradientWrap,
          { width: screenW * LAYER_X, height: screenH * LAYER_Y, transform: [{ translateX }, { translateY }] },
        ]}
      >
        <LinearGradient
          colors={[theme.accent, theme.accentStrong, "#f093fb", "#f5576c", "#4facfe", "#43e97b", "#38f9d7", "#fee140"]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={cardStyle}>
          <BlurView intensity={40} tint={scheme === "dark" ? "dark" : "light"} style={styles.card}>
            <View style={styles.brand}>
              <LinearGradient colors={[theme.accent, theme.accentStrong]} style={styles.brandLogo}>
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
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  page: { flex: 1, backgroundColor: t.accent, overflow: "hidden" },
  // Anchored top-left; the drift only ever moves it up and left, so the
  // oversized layer always covers the screen.
  gradientWrap: { position: "absolute", top: 0, left: 0 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: t.scheme === "dark" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.45)",
    backgroundColor: t.scheme === "dark" ? "rgba(23,27,35,0.72)" : "rgba(255,255,255,0.62)",
    padding: 32,
    overflow: "hidden",
    shadowColor: "#101428",
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
  brandName: { fontSize: 15, fontFamily: FONTS.heading, letterSpacing: 1.5, color: t.text },
  heading: {
    textAlign: "center", fontSize: 26, fontFamily: FONTS.heading, color: t.accentStrong, marginBottom: 6,
  },
  subtitle: { textAlign: "center", color: t.text2, fontSize: 13.5, marginBottom: 22 },
  error: {
    color: t.status.bad,
    backgroundColor: t.status.badSoft,
    borderColor: t.status.bad,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 13.5,
    fontWeight: "600",
  },
});
