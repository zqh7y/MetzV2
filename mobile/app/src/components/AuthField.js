import React, { useMemo, useState } from "react";
import { Text, TextInput, View, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { EyeIcon, LockIcon, MailIcon } from "./AuthIcons";

const ICONS = { mail: MailIcon, lock: LockIcon };

/**
 * .auth-field from templates/auth_base.html: a label, an input carrying a
 * leading icon, and — on password fields — the reveal button.
 *
 * `icon` picks the leading glyph; `reveal` adds the toggle and starts the
 * field masked, matching the web's `type="password"` plus `.auth-reveal`.
 */
export default function AuthField({ label, icon = "mail", reveal = false, action, children, ...inputProps }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);

  const Icon = ICONS[icon] || MailIcon;
  // .auth-input-wrap:focus-within .auth-input-icon { color: var(--accent) }
  const iconColor = focused ? theme.accent : theme.text3;

  return (
    <View style={styles.field}>
      {action ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text style={styles.action}>{action.label}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}

      {/* box-shadow: 0 0 0 4px var(--accent-soft) on focus. A transparent ring
          is always present and pulled back out with a negative margin, so
          gaining focus tints it instead of nudging the layout. */}
      <View style={[styles.ring, focused && styles.ringFocused]}>
        <View style={[styles.box, focused && styles.boxFocused]}>
          <View style={styles.iconSlot}>
            <Icon size={18} color={iconColor} />
          </View>

          <TextInput
            style={styles.input}
            placeholderTextColor={theme.text3}
            secureTextEntry={reveal && !shown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            {...inputProps}
          />

          {reveal ? (
            <Pressable
              onPress={() => setShown((v) => !v)}
              style={styles.reveal}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={shown ? "Hide password" : "Show password"}
              accessibilityState={{ selected: shown }}
            >
              <EyeIcon size={18} color={shown ? theme.text : theme.text3} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Signup hangs its strength meter inside the same .auth-field. */}
      {children}
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  field: { marginBottom: 16 },
  labelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  action: { fontSize: 12, fontFamily: FONTS.bodySemi, color: t.accent, marginBottom: 7 },
  label: {
    fontSize: 12.5,
    fontFamily: FONTS.bodySemi,
    letterSpacing: 0.2,
    color: t.text2,
    marginBottom: 7,
  },

  ring: { borderWidth: 4, borderColor: "transparent", borderRadius: 16, margin: -4 },
  ringFocused: { borderColor: t.accentSoft },

  box: {
    flexDirection: "row",
    alignItems: "center",
    // 14px padding top and bottom around a 15px line, plus the 1.5px borders —
    // the web input measures 49px, so it is pinned rather than re-derived.
    height: 49,
    borderWidth: 1.5,
    borderColor: t.border,
    borderRadius: 12,
    backgroundColor: t.surface,
  },
  boxFocused: { borderColor: t.accent },

  // padding-left: 44px on .auth-input, with the icon sitting at left: 14px.
  iconSlot: { width: 44, paddingLeft: 14, justifyContent: "center" },

  input: {
    flex: 1,
    paddingVertical: 0,
    paddingRight: 6,
    fontSize: 15,
    fontFamily: FONTS.body,
    color: t.text,
    includeFontPadding: false,
  },

  // .auth-reveal { width: 36; height: 36; right: 6; border-radius: 9 }
  reveal: {
    width: 36,
    height: 36,
    marginRight: 6,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
});
