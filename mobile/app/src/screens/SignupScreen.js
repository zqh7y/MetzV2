import React, { useState } from "react";
import { api } from "../api";
import { useI18n } from "../context/LocaleContext";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";
import AuthStrength from "../components/AuthStrength";
import AuthAlt from "../components/AuthAlt";
import GoogleAuthButton from "../components/GoogleAuthButton";
import { useAuth } from "../context/AuthContext";

// Copy, field order and button labels track templates/signup.html.
export default function SignupScreen({ navigation }) {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    setError("");
    setLoading(true);
    try {
      const res = await api.signup(email, password);
      // A token means the server finished the signup itself — it does that
      // when it cannot send the verification email, rather than leaving
      // someone with a Firebase account they have no way to reach. Straight
      // to Home in that case; the code screen would be waiting on a mail that
      // is never coming.
      if (res?.uid && res?.token) signIn(res.uid, res.token);
      else navigation.navigate("Verify", { email });
    } catch (e) {
      // `email_failed` means the account really was created and only the
      // verification mail failed. Older servers report that as a 502 with no
      // token, which used to leave the person stranded on this screen with an
      // account they could not reach. Logging in with the details they just
      // typed finishes the job.
      //
      // Kept even though the API now returns a token directly in that case:
      // the app talks to a deployed server it does not control the version of,
      // and this is the path that works against both.
      if (e?.data?.email_failed) {
        try {
          const res = await api.login(email, password);
          if (res?.uid && res?.token) {
            signIn(res.uid, res.token);
            return;
          }
        } catch (loginError) {
          // Fall through to the original message — it describes the real
          // problem better than whatever login just said about it.
        }
      }
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
      <AuthField
        label={t("common.email")}
        icon="mail"
        placeholder={t("common.emailPlaceholder")}
        keyboardType="email-address"
        textContentType="emailAddress"
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
      {/* Google has already proved the address, so this route skips the
          emailed code entirely — no inbox, no 4 digits, no waiting. */}
      <GoogleAuthButton label={t("signup.google")} />
    </AuthLayout>
  );
}
