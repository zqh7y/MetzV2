import React, { useMemo } from "react";
import { Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";

/**
 * .auth-alt — the "New here? Create an account" line under the button. The
 * plain half and the link are one wrapped sentence on the web, so they are one
 * <Text> here too rather than a row that could break between them.
 */
export default function AuthAlt({ text, linkText, onPress }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Text style={styles.alt}>
      {text}{" "}
      <Text style={styles.link} onPress={onPress} accessibilityRole="link">
        {linkText}
      </Text>
    </Text>
  );
}

const makeStyles = (t) => StyleSheet.create({
  alt: { marginTop: 22, textAlign: "center", fontSize: 13.5, color: t.text2 },
  link: { color: t.accent, fontFamily: FONTS.bodySemi },
});
