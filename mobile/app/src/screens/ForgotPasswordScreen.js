import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { api } from "../api";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";
import AuthAlt from "../components/AuthAlt";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS } from "../styles/theme";

/**
 * Password reset — the way back into an account.
 *
 * Firebase mails the link and hosts the form where the new password is set, so
 * this screen only has to collect an address and say what happens next.
 *
 * Success is reported the same whether or not the address has an account. The
 * server does that on purpose (naming which emails are registered would let a
 * stranger test who is a member), and the screen must not undo it by phrasing
 * the confirmation as though delivery were certain.
 */
export default function ForgotPasswordScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = makeStyles(theme);

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await api.requestPasswordReset(email);
      setSent(true);
    } catch (e) {
      setError(e.message || "Couldn't send the reset link. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={sent ? "Check your email" : "Forgot your password?"}
      subtitle={
        sent
          ? "The link expires after a while, so use it soon."
          : "Give us the email you signed up with and we'll send a reset link."
      }
      error={error}
      footer={
        <AuthAlt
          text={sent ? "Done?" : "Remembered it?"}
          linkText="Back to log in"
          onPress={() => navigation.navigate("Login")}
        />
      }
    >
      {sent ? (
        <View style={styles.sent}>
          <Text style={styles.sentIcon}>📬</Text>
          <Text style={styles.sentText}>
            If that email has an account, a reset link is on its way. Check your
            inbox, and your spam folder.
          </Text>
        </View>
      ) : (
        <>
          <AuthField
            label="Email"
            icon="mail"
            placeholder="you@example.com"
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <AuthButton
            label="Send reset link"
            busyLabel="Sending…"
            onPress={handleSend}
            loading={loading}
          />
        </>
      )}
    </AuthLayout>
  );
}

const makeStyles = (t) => StyleSheet.create({
  sent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: RADIUS.base,
    backgroundColor: t.accentSoft,
    borderWidth: 1,
    borderColor: t.accent,
  },
  sentIcon: { fontSize: 20, lineHeight: 24 },
  sentText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: t.text, fontFamily: FONTS.body },
});
