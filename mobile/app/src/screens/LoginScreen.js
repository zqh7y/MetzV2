import React, { useState } from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";
import AuthField from "../components/AuthField";
import AuthButton from "../components/AuthButton";

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
      signIn(res.uid);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to discover meetups near you"
      error={error}
      footer={
        <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
          <Text style={styles.link}>Don't have an account? Sign up</Text>
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
        placeholder="Your password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <AuthButton label="Login" onPress={handleLogin} loading={loading} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  link: { textAlign: "center", color: "#3498db", marginTop: 18, fontWeight: "600" },
});
