import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function VerifyScreen({ route }) {
  const { email } = route.params;
  const { signIn } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    setError("");
    setLoading(true);
    try {
      const res = await api.verify(email, code);
      signIn(res.uid);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Check your email</Text>
      <Text style={styles.subtitle}>We sent a 4-digit code to {email}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="4-digit code"
        keyboardType="number-pad"
        maxLength={4}
        value={code}
        onChangeText={setCode}
      />

      <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => api.resendVerify(email)}>
        <Text style={styles.link}>Resend code</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#f0f2f5" },
  brand: { fontSize: 24, fontWeight: "800", color: "#667eea", textAlign: "center" },
  subtitle: { textAlign: "center", color: "#888", marginBottom: 24 },
  input: {
    backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 12, borderWidth: 1, borderColor: "#e8eaed", fontSize: 20, textAlign: "center", letterSpacing: 8,
  },
  button: { backgroundColor: "#667eea", borderRadius: 24, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  link: { textAlign: "center", color: "#3498db", marginTop: 16, fontWeight: "600" },
  error: { color: "#e74c3c", textAlign: "center", marginBottom: 12, fontWeight: "600" },
});
