import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";
import AuthButton from "../components/AuthButton";

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
    <AuthLayout
      title="Check your email"
      subtitle={`We sent a 4-digit code to ${email}`}
      error={error}
      footer={
        <TouchableOpacity onPress={() => api.resendVerify(email)}>
          <Text style={styles.link}>Resend code</Text>
        </TouchableOpacity>
      }
    >
      <TextInput
        style={styles.codeInput}
        placeholder="0000"
        placeholderTextColor="#c7ccd1"
        keyboardType="number-pad"
        maxLength={4}
        value={code}
        onChangeText={setCode}
      />
      <AuthButton label="Verify" onPress={handleVerify} loading={loading} />
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  codeInput: {
    fontSize: 28, fontWeight: "800", color: "#2c3e50", textAlign: "center", letterSpacing: 8,
    borderWidth: 2, borderColor: "#e0e0e0", borderRadius: 12, backgroundColor: "rgba(249,249,251,0.8)",
    paddingVertical: 14, marginBottom: 16,
  },
  link: { textAlign: "center", color: "#3498db", marginTop: 18, fontWeight: "600" },
});
