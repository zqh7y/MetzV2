import React, { useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";
import AuthAlt from "../components/AuthAlt";

// Copy, field order and button labels track templates/login.html.
export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
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
      title="Welcome back"
      subtitle="Log in to pick up where you left off."
      error={error}
      footer={
        <AuthAlt
          text="New here?"
          linkText="Create an account"
          onPress={() => navigation.navigate("Signup")}
        />
      }
    >
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
      />
      <AuthField
        label="Password"
        icon="lock"
        reveal
        // Sits on the label line, next to the field it belongs to.
        action={{ label: "Forgot?", onPress: () => navigation.navigate("ForgotPassword") }}
        placeholder="Your password"
        textContentType="password"
        autoComplete="current-password"
        autoCapitalize="none"
        autoCorrect={false}
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={handleLogin}
        returnKeyType="go"
      />
      <AuthButton label="Log in" busyLabel="Logging in…" onPress={handleLogin} loading={loading} />
    </AuthLayout>
  );
}
