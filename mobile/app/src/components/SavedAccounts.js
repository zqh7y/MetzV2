import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";

import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";

/**
 * One-tap return to an account this device is still signed into.
 *
 * Renders nothing when there is nobody to offer, so the login screen is
 * unchanged for anyone who has only ever used one account.
 */
export default function SavedAccounts({ accounts, onPick }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (!accounts?.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Continue as</Text>
      {accounts.map((account) => {
        const name = account.name || account.email || account.uid;
        return (
          <Pressable
            key={account.uid}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => onPick(account)}
          >
            <View style={[styles.avatar, { backgroundColor: account.color || theme.accent }]}>
              <Text style={account.emoji ? styles.emoji : styles.initials}>
                {account.emoji || name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              {account.email ? (
                <Text style={styles.email} numberOfLines={1}>{account.email}</Text>
              ) : null}
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  wrap: { marginTop: 18 },
  label: { fontSize: 12, fontFamily: FONTS.bodySemi, color: t.text3, marginBottom: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 11,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
    borderRadius: RADIUS.base, borderWidth: 1, borderColor: t.border,
    backgroundColor: t.surface,
  },
  rowPressed: { opacity: 0.6 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  initials: { color: "#fff", fontFamily: FONTS.heading, fontSize: 12.5 },
  emoji: { fontSize: 18 },
  name: { fontSize: 14, fontFamily: FONTS.bodySemi, color: t.text },
  email: { fontSize: 12, color: t.text3, marginTop: 1 },
  chevron: { fontSize: 20, color: t.text3 },
});
