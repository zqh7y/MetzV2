import React, { useMemo, useState } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/LocaleContext";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";
import AuthAlt from "../components/AuthAlt";
import GoogleAuthButton from "../components/GoogleAuthButton";
import SavedAccounts from "../components/SavedAccounts";
import { canSwitchTo } from "../accounts";
import { GOOGLE_AUTH_READY, IS_EXPO_GO } from "../config";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";

// Copy, field order and button labels track templates/login.html.
export default function LoginScreen({ navigation }) {
  const { signIn, accounts, switchTo, uid } = useAuth();
  const { t } = useI18n();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Open from the start only when Google is not on offer — see the note by the
  // toggle below.
  const [showEmail, setShowEmail] = useState(!GOOGLE_AUTH_READY || IS_EXPO_GO);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError("");
    setLoading(true);
    try {
      const res = await api.login(email, password);
      signIn(res.uid, res.token);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      error={error}
      footer={
        <AuthAlt
          text={t("login.newHere")}
          linkText={t("login.createAccount")}
          onPress={() => navigation.navigate("Signup")}
        />
      }
    >
      {/* The way in, first and on its own. */}
      <GoogleAuthButton primary />

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
        textContentType="username"
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
        // Sits on the label line, next to the field it belongs to.
        action={{ label: t("login.forgot"), onPress: () => navigation.navigate("ForgotPassword") }}
        placeholder={t("common.passwordPlaceholder")}
        textContentType="password"
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect={false}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={handleLogin}
        returnKeyType="go"
      />
      <AuthButton label={t("login.submit")} busyLabel={t("login.submitting")} onPress={handleLogin} loading={loading} />
      </>
      ) : null}

      {/* Accounts this phone has used before, still holding a valid session —
          the point of switching is not typing a password, so the shortcut
          belongs on the screen you land on after choosing to switch. Ones
          whose token has lapsed are left out: they would need this form
          anyway, and offering a tap that just refills the email is noise. */}
      <SavedAccounts
        accounts={accounts.filter((a) => a.uid !== uid && canSwitchTo(a))}
        onPick={(account) => {
          if (!switchTo(account)) setError(t("login.sessionExpired"));
        }}
      />
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

