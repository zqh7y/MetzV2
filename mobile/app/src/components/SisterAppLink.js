import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";

import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import BrandMark from "./BrandMark";
import { IS_HOST } from "../variant";

/**
 * A door to the other Metz.
 *
 * The two apps are halves of one thing: Metz is for finding something to go to,
 * Metz Host is for putting something on. Somebody who has one and wants the
 * other has no way to know the other exists — two Play listings do not
 * introduce themselves — so each app carries a pointer to its sibling.
 *
 * Tapping it opens the app if it is installed and the store listing if it is
 * not. `canOpenURL` needs the sibling's scheme declared in <queries> in
 * AndroidManifest.xml, or Android 11+ answers false for an app that is sitting
 * right there; both schemes are declared, so each build can see the other.
 *
 * **The store half only works once that app is published.** Until then the
 * link lands on Play's "item not found". Nothing here can detect that — Play
 * has no API for "does this listing exist" that an app may call — so if one
 * app ships before the other, hide this until both are up.
 */
const APPS = {
  metz: {
    package: "com.metz.app",
    scheme: "metz://",
    name: "Metz",
    leadKey: "sister.metzLead",
    bodyKey: "sister.metzBody",
  },
  host: {
    package: "com.metz.host",
    scheme: "metzhost://",
    name: "Metz Host",
    leadKey: "sister.hostLead",
    bodyKey: "sister.hostBody",
  },
};

// Each app points at the one it is not.
const OTHER = IS_HOST ? APPS.metz : APPS.host;

export default function SisterAppLink({ style, compact = false }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  async function open() {
    try {
      if (await Linking.canOpenURL(OTHER.scheme)) {
        await Linking.openURL(OTHER.scheme);
        return;
      }
    } catch (e) {
      // Not installed, or the scheme is not visible to this build. Either way
      // the store is the right answer.
    }
    Linking.openURL(`https://play.google.com/store/apps/details?id=${OTHER.package}`)
      .catch(() => {});
  }

  // Compact: a pill beside the wordmark, where it is the second thing on the
  // screen rather than something found at the bottom of Settings. It says the
  // other app exists and nothing else — the explaining is Settings' job.
  if (compact) {
    return (
      <Pressable
        style={({ pressed }) => [styles.pill, pressed && styles.pressed, style]}
        onPress={open}
        accessibilityRole="link"
        accessibilityLabel={`${t("sister.get")} ${OTHER.name}`}
        hitSlop={8}
      >
        <Text style={styles.pillText}>{`${t("sister.get")} ${OTHER.name}  ↗`}</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={OTHER.name}
    >
      {/* The same mark, in the other app's clothes — it is the same product,
          and two unrelated-looking icons would suggest otherwise. */}
      <View style={styles.markWrap}>
        <BrandMark size={26} color={theme.accent} bg={theme.surface} />
      </View>

      <View style={styles.body}>
        <Text style={styles.lead}>{t(OTHER.leadKey)}</Text>
        <Text style={styles.text}>{t(OTHER.bodyKey)}</Text>
        <Text style={styles.action}>{`${OTHER.name}  ›`}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (t) => StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    // Tinted rather than bordered. Among a column of white cards a bordered
    // one reads as another section of the page and is skipped with them; the
    // accent tint is the only thing on the screen that is not a card, which is
    // what makes it the thing you notice.
    backgroundColor: t.accentSoft,
    borderRadius: RADIUS.lg,
    padding: 16,
  },
  pressed: { opacity: 0.8 },
  markWrap: {
    width: 44, height: 44, borderRadius: RADIUS.base,
    backgroundColor: t.surface,
    alignItems: "center", justifyContent: "center",
  },
  body: { flex: 1 },
  lead: { fontFamily: FONTS.heading, fontSize: t.fs(15), color: t.accentDeep || t.accentStrong },
  text: { fontSize: t.fs(13), color: t.text2, marginTop: 4, lineHeight: t.fs(19) },
  action: { fontFamily: FONTS.accent, fontSize: t.fs(13), color: t.accentStrong, marginTop: 8 },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
    backgroundColor: t.accentSoft,
  },
  pillText: { fontFamily: FONTS.accent, fontSize: t.fs(11.5), color: t.accentStrong },
});
