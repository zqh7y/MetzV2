import React, { useMemo, useState } from "react";
import { TextInput, StyleSheet } from "react-native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";
import AuthButton from "../components/AuthButton";
import AuthAlt from "../components/AuthAlt";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";

export default function VerifyScreen({ route }) {
  const { email } = route.params;
  const { signIn } = useAuth();
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleVerify() {
    setError("");
    setLoading(true);
    try {
      const res = await api.verify(email, code);
      signIn(res.uid, res.token);
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
        <AuthAlt
          text="Didn't get it?"
          linkText="Resend code"
          onPress={() => api.resendVerify(email)}
        />
      }
    >
      <TextInput
        style={styles.codeInput}
        placeholder="0000"
        placeholderTextColor={theme.text3}
        keyboardType="number-pad"
        maxLength={4}
        value={code}
        onChangeText={setCode}
      />
      <AuthButton label="Verify" onPress={handleVerify} loading={loading} />
    </AuthLayout>
  );
}

// Same surface/border tokens as .auth-input, just sized for a 4-digit code.
const makeStyles = (t) => StyleSheet.create({
  codeInput: {
    fontSize: 28, fontFamily: FONTS.headingExtra, color: t.text, textAlign: "center", letterSpacing: 8,
    borderWidth: 1.5, borderColor: t.border, borderRadius: 12, backgroundColor: t.surface,
    paddingVertical: 14, marginBottom: 16,
  },
});
