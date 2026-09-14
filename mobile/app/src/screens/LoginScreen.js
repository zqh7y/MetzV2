import React, { useState } from "react";
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

// Copy, field order and button labels track templates/login.html.
export default function LoginScreen({ navigation }) {
  const { signIn, accounts, switchTo, uid } = useAuth();
  const { t } = useI18n();
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
      <GoogleAuthButton />

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
