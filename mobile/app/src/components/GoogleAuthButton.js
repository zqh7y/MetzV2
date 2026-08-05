import React, { useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import AnimatedPressable from "./AnimatedPressable";
import useGoogleSignIn from "../hooks/useGoogleSignIn";
import { GOOGLE_AUTH_READY } from "../config";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";

/**
 * "Continue with Google", for the login and signup screens.
 *
 * Renders nothing when no OAuth client id is configured. A button that opens
 * Google only to come back with "invalid_request" is worse than no button:
 * the person cannot tell that the app is misconfigured rather than their
 * account being at fault.
 *
 * Outlined rather than filled, unlike AuthButton, so it reads as the second
 * way in rather than competing with the form's own submit.
 */
export default function GoogleAuthButton({ label = "Continue with Google" }) {
  // The gate is here, outside the component that owns the hook, because
  // useGoogleSignIn cannot be called conditionally and the provider inside it
  // *throws during render* when this platform's client id is missing. Checking
  // after calling it would be too late — the screen is already down.
  if (!GOOGLE_AUTH_READY) return null;
  return <GoogleAuthButtonInner label={label} />;
}

function GoogleAuthButtonInner({ label }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { available, busy, error, signIn } = useGoogleSignIn();

  if (!available) return null;

  return (
    <View>
      <View style={styles.dividerRow}>
        <View style={styles.rule} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.rule} />
      </View>

      <AnimatedPressable onPress={signIn} disabled={busy} scaleTo={0.985}>
        <View style={[styles.button, busy && styles.buttonInert]}>
          {busy ? (
            <ActivityIndicator color={theme.text2} size="small" />
          ) : (
            <>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>G</Text>
              </View>
              <Text style={styles.label}>{label}</Text>
            </>
          )}
        </View>
      </AnimatedPressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 16 },
  rule: { flex: 1, height: 1, backgroundColor: t.border },
  dividerText: { color: t.text3, fontSize: 12, fontFamily: FONTS.accentMedium },

  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface,
    minHeight: 50,
  },
  buttonInert: { opacity: 0.6 },
  // Google's own mark is a licensed asset, so this is a plain lettermark in
  // their blue rather than a redrawn copy of it.
  badge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1, borderColor: "#dadce0",
  },
  badgeText: { color: "#4285f4", fontFamily: FONTS.heading, fontSize: 13, lineHeight: 16 },
  label: { color: t.text, fontFamily: FONTS.headingSemi, fontSize: 15 },
  error: { color: t.status.bad, fontSize: 12.5, marginTop: 8, textAlign: "center" },
});
