import React, { useMemo, useState } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { api } from "../api";
import { useI18n } from "../context/LocaleContext";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";
import AuthStrength from "../components/AuthStrength";
import AuthAlt from "../components/AuthAlt";
import GoogleAuthButton from "../components/GoogleAuthButton";
import { useAuth } from "../context/AuthContext";
import { GOOGLE_AUTH_READY, IS_EXPO_GO } from "../config";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";

// Copy, field order and button labels track templates/signup.html.
export default function SignupScreen({ navigation }) {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [showEmail, setShowEmail] = useState(!GOOGLE_AUTH_READY || IS_EXPO_GO);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    setError("");
    setLoading(true);
    try {
      // Signing up now ends in a session rather than a code screen: there is
      // no verification step left for the server to send anyone to.
      const res = await api.signup(email, password);
      if (res?.uid && res?.token) signIn(res.uid, res.token);
      else setError(t("signup.failed"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={t("signup.title")}
      subtitle={t("signup.subtitle")}
      error={error}
      footer={
        <AuthAlt
          text={t("signup.haveAccount")}
          linkText={t("signup.logIn")}
          onPress={() => navigation.navigate("Login")}
        />
      }
    >
      {/* The way in, first and on its own. Google has already proved the
          address, which is the one thing signing up here cannot check. */}
      <GoogleAuthButton label={t("signup.google")} primary />

      {/* Email is the fallback, so it stays behind a tap. Not hidden as a
          matter of taste: leaving both on screen makes them read as equal
          choices, and the point of the change is that one of them is the way
          in and the other is for people who will not use it.

          It starts open whenever Google cannot be offered — no client id, or
          Expo Go, which cannot do Google at all. A screen whose only visible
          action is one this build cannot perform is a dead end. */}
      {showEmail ? null : (
        <Pressable onPress={() => setShowEmail(true)} style={styles.emailToggle}>
          <Text style={styles.emailToggleText}>{t("common.useEmailInstead")}</Text>
        </Pressable>
      )}

      {showEmail ? (
      <>
      <AuthField
        label={t("common.email")}
        icon="mail"
        placeholder={t("common.emailPlaceholder")}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        // No autoFocus: the field is revealed rather than present on arrival,
        // and raising a keyboard over a screen somebody has not asked to type
        // on hides the Google button they were looking at.
        value={email}
        onChangeText={setEmail}
      />
      <AuthField
        label={t("common.password")}
        icon="lock"
        reveal
        placeholder={t("signup.passwordPlaceholder")}
        textContentType="newPassword"
        autoComplete="new-password"
        autoCapitalize="none"
        autoCorrect={false}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={handleSignup}
        returnKeyType="go"
      >
        <AuthStrength value={password} />
      </AuthField>
      <AuthButton
        label={t("signup.submit")}
        busyLabel={t("signup.submitting")}
        onPress={handleSignup}
        loading={loading}
      />
      </>
      ) : null}
    </AuthLayout>
  );
}

const makeStyles = (t) => StyleSheet.create({
  emailToggle: { paddingVertical: 14, alignItems: "center" },
  emailToggleText: {
    color: t.text2, fontSize: t.fs(14), fontFamily: FONTS.bodySemi,
    textDecorationLine: "underline",
  },
});

