import React, { useEffect, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Animated, Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { AlertIcon } from "./AuthIcons";

// Mirrors the .auth shell in templates/auth_base.html as the web renders it
// below its 900px breakpoint: there `.auth-aside { display: none }` drops the
// gradient brand panel entirely and `.auth-main` takes the screen, so a phone
// sees a plain --bg page with the compact `.auth-mini-brand` standing in for
// the panel. A phone is always on that side of the breakpoint, which is why
// none of the split-column or gradient styling is carried over here.
export default function AuthLayout({ title, subtitle, error, children, footer }) {
  const { theme, reduceMotion } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // .auth-card: authCardIn 0.55s cubic-bezier(0.4, 0, 0.2, 1) both
  const cardIn = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      cardIn.setValue(1);
      return;
    }
    Animated.timing(cardIn, {
      toValue: 1,
      duration: 550,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [cardIn, reduceMotion]);

  const cardStyle = {
    opacity: cardIn,
    transform: [{ translateY: cardIn.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };

  return (
    <View style={styles.page}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.card, cardStyle]}>

            {/* .auth-mini-brand — the phone's stand-in for the brand panel */}
            <View style={styles.brand}>
              <LinearGradient
                colors={[theme.accent, theme.accentStrong]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.brandLogo}
              >
                <Text style={styles.brandLogoText}>M</Text>
              </LinearGradient>
              {/* text-transform: uppercase on .auth-mini-name */}
              <Text style={styles.brandName}>METZ</Text>
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            {error ? (
              <View style={styles.error} accessibilityRole="alert">
                <View style={styles.errorIcon}>
                  <AlertIcon size={17} color={ERROR_FG} />
                </View>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {children}

            {footer}

            <Text style={styles.legal}>
              By continuing you agree to how Metz handles your data, described in the privacy policy.
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// .auth-error is a fixed red on both themes in the stylesheet, not a token.
const ERROR_FG = "#c0392b";
const ERROR_BORDER = "rgba(231, 76, 60, 0.35)";
const ERROR_BG = "rgba(231, 76, 60, 0.08)";

const makeStyles = (t) => StyleSheet.create({
  page: { flex: 1, backgroundColor: t.bg },
  flex: { flex: 1 },
  // .auth-main { padding: 32px 22px 44px } and centres its card
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 32,
    paddingBottom: 44,
  },
  // .auth-card { width: 100%; max-width: 400px }
  card: { width: "100%", maxWidth: 400, alignSelf: "center" },

  brand: { flexDirection: "row", alignItems: "center", marginBottom: 26 },
  brandLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    shadowColor: t.accent,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  brandLogoText: { color: "#fff", fontFamily: FONTS.headingExtra, fontSize: 19, includeFontPadding: false },
  brandName: {
    fontFamily: FONTS.headingExtra,
    fontSize: 15,
    letterSpacing: 1.4,
    color: t.text,
  },

  title: {
    fontFamily: FONTS.headingExtra,
    fontSize: 27,
    letterSpacing: -0.4,
    color: t.text,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: t.text2,
    marginBottom: 26,
  },

  error: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: ERROR_BORDER,
    backgroundColor: ERROR_BG,
  },
  errorIcon: { marginRight: 10, paddingTop: 1 },
  errorText: {
    flex: 1,
    color: ERROR_FG,
    fontSize: 13.5,
    lineHeight: 19.5,
    fontFamily: FONTS.bodySemi,
  },

  legal: {
    marginTop: 26,
    textAlign: "center",
    fontSize: 11.5,
    lineHeight: 17,
    color: t.text3,
  },
});
