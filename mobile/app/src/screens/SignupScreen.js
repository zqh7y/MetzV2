import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../api";

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
    <View style={styles.container}>
      <Text style={styles.brand}>Metz</Text>
      <Text style={styles.subtitle}>Create an account to get started</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.link}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f0f2f5" },
  brand: { fontSize: 32, fontWeight: "800", color: "#667eea", textAlign: "center" },
  subtitle: { textAlign: "center", color: "#888", marginBottom: 24 },
  input: {
    backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 12, borderWidth: 1, borderColor: "#e8eaed", fontSize: 15,
  },
  button: { backgroundColor: "#667eea", borderRadius: 24, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  link: { textAlign: "center", color: "#3498db", marginTop: 16, fontWeight: "600" },
  error: { color: "#e74c3c", textAlign: "center", marginBottom: 12, fontWeight: "600" },
});
