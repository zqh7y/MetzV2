import React, { useState } from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import { api } from "../api";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";

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
      subtitle="Join Metz and start meeting people nearby"
      error={error}
      footer={
        <TouchableOpacity onPress={() => navigation.navigate("Login")}>
          <Text style={styles.link}>Already have an account? Login</Text>
        </TouchableOpacity>
      }
    >
      <AuthField
        label="Email"
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <AuthField
        label="Password"
        placeholder="At least 8 characters"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <AuthButton label="Sign Up" onPress={handleSignup} loading={loading} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  link: { textAlign: "center", color: "#3498db", marginTop: 18, fontWeight: "600" },
});
