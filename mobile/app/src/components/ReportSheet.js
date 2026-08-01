import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal, View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";

import { api } from "../api";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { RADIUS, SHADOW } from "../styles/theme";

/**
 * Report a meeting or a person.
 *
 * Reasons come from the server rather than being hard-coded here, so the list
 * the user picks from is always one the API will accept.
 *
 * The confirmation deliberately does not say whether this was the first report
 * about the thing. Telling someone "you already reported this" leaks that
 * their earlier report exists and invites them to keep checking; either way the
 * honest answer is that it is with a moderator.
 */
export default function ReportSheet({ visible, onClose, targetType, targetId, targetLabel }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [reasons, setReasons] = useState([]);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    // Reset each time it opens: a stale reason from a previous report would be
    // easy to send by accident.
    setReason("");
    setDetail("");
    setSent(false);
    setError("");
    api.getReportReasons().then(setReasons).catch(() => setReasons([]));
  }, [visible]);

  const submit = useCallback(async () => {
    if (!reason || sending) return;
    setSending(true);
    setError("");
    try {
      await api.reportContent(targetType, targetId, reason, detail);
      setSent(true);
    } catch (e) {
      setError(e.message || "Couldn't send that report. Try again.");
    } finally {
      setSending(false);
    }
  }, [reason, detail, sending, targetType, targetId]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <KeyboardAvoidingView
        style={styles.dock}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          {sent ? (
            <View style={styles.done}>
              <Text style={styles.doneIcon}>✅</Text>
              <Text style={styles.title}>Thanks — that's with us</Text>
              <Text style={styles.body}>
                A moderator will look at it. If you'd rather not see this person at
                all, you can block them from their profile.
              </Text>
              <Pressable style={styles.primary} onPress={onClose}>
                <Text style={styles.primaryText}>Done</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>Report {targetType === "user" ? "this person" : "this meeting"}</Text>
              {targetLabel ? <Text style={styles.target} numberOfLines={1}>{targetLabel}</Text> : null}
              <Text style={styles.body}>What's wrong with it?</Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.reasons}>
                {reasons.map((r) => (
                  <Pressable
                    key={r.id}
                    style={[styles.reason, reason === r.id && styles.reasonActive]}
                    onPress={() => setReason(r.id)}
                  >
                    <Text style={[styles.reasonText, reason === r.id && styles.reasonTextActive]}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Anything else? (optional)</Text>
              <TextInput
                style={styles.input}
                value={detail}
                onChangeText={setDetail}
                placeholder="Add anything that would help a moderator."
                placeholderTextColor={theme.text3}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />

              <View style={styles.actions}>
                <Pressable style={styles.secondary} onPress={onClose}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.primary, (!reason || sending) && styles.primaryInert]}
                  onPress={submit}
                  disabled={!reason || sending}
                >
                  {sending
                    ? <ActivityIndicator color={theme.accentOn} />
                    : <Text style={[styles.primaryText, !reason && styles.primaryTextInert]}>Send report</Text>}
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (t) => StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,14,24,0.45)" },
  dock: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: t.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
    maxHeight: "88%",
    ...SHADOW.s3,
  },
  grabber: {
    width: 42, height: 5, borderRadius: 3, backgroundColor: t.surface3,
    alignSelf: "center", marginBottom: 14,
  },

  title: { fontSize: 18, fontFamily: FONTS.heading, color: t.text },
  target: { fontSize: 12.5, color: t.text3, marginTop: 3 },
  body: { fontSize: 13.5, color: t.text2, marginTop: 10, lineHeight: 19 },
  label: {
    fontSize: 11, fontFamily: FONTS.bodySemi, color: t.text3,
    textTransform: "uppercase", letterSpacing: 0.5, marginTop: 18, marginBottom: 7,
  },
  error: {
    marginTop: 10, padding: 10, borderRadius: RADIUS.base,
    backgroundColor: t.status.badSoft, color: t.status.bad,
    fontSize: 12.5, fontFamily: FONTS.bodySemi,
  },

  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  reason: {
    borderRadius: RADIUS.pill, paddingHorizontal: 13, paddingVertical: 8,
    backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border,
  },
  reasonActive: { backgroundColor: t.accent, borderColor: t.accent },
  reasonText: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: t.text2 },
  reasonTextActive: { color: t.accentOn },

  input: {
    backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border,
    borderRadius: RADIUS.base, padding: 12, fontSize: 14.5, color: t.text,
    height: 88,
  },

  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  secondary: {
    flex: 1, borderRadius: RADIUS.base, paddingVertical: 14, alignItems: "center",
    backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border,
  },
  secondaryText: { fontSize: 14.5, fontFamily: FONTS.accentMedium, color: t.text2 },
  primary: {
    flex: 1, borderRadius: RADIUS.base, paddingVertical: 14, alignItems: "center",
    justifyContent: "center", backgroundColor: t.accent,
  },
  primaryInert: { backgroundColor: t.surface3 },
  primaryText: { fontSize: 14.5, fontFamily: FONTS.accent, color: t.accentOn },
  primaryTextInert: { color: t.text3 },

  done: { alignItems: "center", paddingVertical: 10 },
  doneIcon: { fontSize: 38, marginBottom: 10 },
});
