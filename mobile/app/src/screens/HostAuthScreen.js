import React, { useState } from "react";
import { Text, StyleSheet, Pressable } from "react-native";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/LocaleContext";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";
import GoogleAuthButton from "../components/GoogleAuthButton";
import SavedAccounts from "../components/SavedAccounts";
import { canSwitchTo } from "../accounts";

/**
 * The only way into Metz Host: sign in with Google.
 *
 * The full app offers email and password as well, because it is what somebody
 * discovering the app on a map is most likely to reach for. Host is the
 * opposite case — it is opened by a person who has decided to run something,
 * on a phone that already has a Google account signed in, and one tap beats a
 * form. A Host account is an ordinary Metz account: the meetings made here show
 * up in the full app, and signing in there with the same Google account finds
 * the same person.
 *
 * **The email form below ships nowhere.** It is behind `__DEV__`, which is
 * stripped from a release bundle, and it exists because Google sign-in cannot
 * work in Expo Go at all — its redirect is `exp://`, which Google rejects
 * outright. Without a way past this screen in development, every change to the
 * two screens behind it would need a twenty-minute APK build to look at.
 */
export default function HostAuthScreen() {
  const { signIn, accounts, switchTo, uid } = useAuth();
  const { t } = useI18n();
  const { theme } = useTheme();

  const [error, setError] = useState("");
  const [devOpen, setDevOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleDevLogin() {
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
    <AuthLayout title={t("host.title")} subtitle={t("host.subtitle")} error={error}>
      <GoogleAuthButton />

      {/* Accounts this phone has already used, still holding a live session.
          Worth as much here as in the full app: the fastest sign-in is the one
          that needs no provider at all. */}
      <SavedAccounts
        accounts={accounts.filter((a) => a.uid !== uid && canSwitchTo(a))}
        onPick={(account) => {
          if (!switchTo(account)) setError(t("login.sessionExpired"));
        }}
      />

      {__DEV__ ? (
        devOpen ? (
          <>
            <AuthField
              label={t("common.email")}
              icon="mail"
              placeholder={t("common.emailPlaceholder")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
            <AuthField
              label={t("common.password")}
              icon="lock"
              reveal
              placeholder={t("common.passwordPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleDevLogin}
              returnKeyType="go"
            />
            <AuthButton
              label={t("login.submit")}
              busyLabel={t("login.submitting")}
              onPress={handleDevLogin}
              loading={loading}
            />
          </>
        ) : (
          <Pressable onPress={() => setDevOpen(true)} accessibilityRole="button">
            <Text style={[styles.dev, { color: theme.text3 }]}>{t("host.devSignIn")}</Text>
          </Pressable>
        )
      ) : null}
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  // Deliberately quiet, and deliberately not a button: it is scaffolding, and
  // it should never look like one of the two real ways in.
  dev: { marginTop: 26, textAlign: "center", fontSize: 12, fontFamily: FONTS.body },
});
