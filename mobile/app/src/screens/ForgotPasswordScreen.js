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
import { useI18n } from "../context/LocaleContext";

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
  const { t } = useI18n();
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
      setError(e.message || t("forgot.failed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={sent ? t("verify.title") : t("forgot.title")}
      subtitle={
        sent
          ? t("forgot.sentSubtitle")
          : t("forgot.subtitle")
      }
      error={error}
      footer={
        <AuthAlt
          text={sent ? t("forgot.done") : t("forgot.remembered")}
          linkText={t("forgot.backToLogin")}
          onPress={() => navigation.navigate("Login")}
        />
      }
    >
      {sent ? (
        <View style={styles.sent}>
          <Text style={styles.sentIcon}>📬</Text>
          <Text style={styles.sentText}>{t("forgot.sentBody")}</Text>
        </View>
      ) : (
        <>
          <AuthField
            label={t("common.email")}
            icon="mail"
            placeholder={t("common.emailPlaceholder")}
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
            label={t("forgot.submit")}
            busyLabel={t("forgot.submitting")}
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
