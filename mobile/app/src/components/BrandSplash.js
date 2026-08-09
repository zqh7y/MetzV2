import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import BrandMark from "./BrandMark";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";

/**
 * The screen shown while the app reloads itself for a different account.
 *
 * It is doing real work, not decoration: switching accounts leaves every
 * mounted screen holding the previous person's data, and the only reliable way
 * to clear that is to remount the whole tree (see the `key` on the navigator in
 * App.js). A remount means a blank frame and a burst of refetching, so this
 * covers it with something worth looking at rather than a flash of empty state.
 */
export default function BrandSplash() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={[styles.page, { paddingBottom: insets.bottom + 28 }]}>
      <View style={styles.middle}>
        <BrandMark size={104} color={theme.accent} bg={theme.bg} />
        <Text style={styles.name}>Metz</Text>
        <Text style={styles.tagline}>{t("drawer.tagline")}</Text>
      </View>

      {/* Sat at the bottom rather than under the mark: the lockup is the thing
          to look at, and a paragraph directly beneath it competes with it. */}
      <Text style={styles.blurb}>{t("splash.blurb")}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  page: { flex: 1, backgroundColor: t.bg, paddingHorizontal: 32 },
  // Optically centred: a block sitting on the exact middle reads as low.
  middle: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 40 },
  name: {
    marginTop: 22,
    fontFamily: FONTS.headingExtra,
    fontSize: 34,
    letterSpacing: -0.6,
    color: t.text,
  },
  tagline: { marginTop: 6, fontSize: 14, color: t.text2 },
  blurb: {
    textAlign: "center",
    fontSize: 12.5,
    lineHeight: 19,
    color: t.text3,
  },
});
