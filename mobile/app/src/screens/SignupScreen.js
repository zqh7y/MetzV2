import React, { useState } from "react";
import { api } from "../api";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";
import AuthStrength from "../components/AuthStrength";
import AuthAlt from "../components/AuthAlt";
import GoogleAuthButton from "../components/GoogleAuthButton";

// Copy, field order and button labels track templates/signup.html.
export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    setError("");
    setLoading(true);
    try {
      await api.signup(email, password);
      navigation.navigate("Verify", { email });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Takes a minute. We'll email you a code to confirm it's you."
      error={error}
      footer={
        <AuthAlt
          text="Already have an account?"
          linkText="Log in"
          onPress={() => navigation.navigate("Login")}
        />
      }
    >
      <AuthField
        label="Email"
        icon="mail"
        placeholder="you@example.com"
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
        label="Password"
        icon="lock"
        reveal
        placeholder="At least 8 characters"
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
        label="Create account"
        busyLabel="Creating account…"
        onPress={handleSignup}
        loading={loading}
      />
      {/* Google has already proved the address, so this route skips the
          emailed code entirely — no inbox, no 4 digits, no waiting. */}
      <GoogleAuthButton label="Sign up with Google" />
    </AuthLayout>
  );
}
