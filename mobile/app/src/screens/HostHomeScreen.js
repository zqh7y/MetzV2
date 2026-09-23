import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/LocaleContext";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { RADIUS, SHADOW } from "../styles/theme";
import BrandMark from "../components/BrandMark";
import FaceAvatar from "../components/FaceAvatar";
import { ChartIcon } from "../components/NavIcons";
import SisterAppLink from "../components/SisterAppLink";
import HostDashboardScreen from "./HostDashboardScreen";

/**
 * Metz Host opens on what you have made, not on what other people have.
 *
 * The full app opens on a map, because its question is "what is happening near
 * me". Host's question is "how are mine doing", which HostDashboardScreen
 * already answers in full — the totals, every meeting you have run, and a way
 * into each one's figures. Rather than write a second version of that, this
 * screen is a bar above it: who you are, and the one button the app exists for.
 *
 * So the whole light app is three screens and almost no new code — this bar,
 * the Google sign-in, and the create form the full app already had.
 */
export default function HostHomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { t } = useI18n();
  const { profile } = useAuth();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const name = profile?.display_name || profile?.username || "";

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.brand}>
          <BrandMark size={26} color={theme.accent} bg={theme.surface} />
          <Text style={styles.wordmark}>Metz</Text>
          {/* Says which of the two apps this is, without competing with the
              name — the launcher icon and the store listing carry that job. */}
          <Text style={styles.variant}>Host</Text>
          {/* Beside the wordmark, so the other app is the second thing on the
              screen rather than something found at the bottom of Settings.
              Small on purpose: it has to be noticed, not competed with — the
              button this app exists for is the one at the bottom. */}
          <SisterAppLink compact />
        </View>

        <View style={styles.barRight}>
          {/* Everything measured lives behind this. Home is for the meetings
              themselves; somebody who wants to know how it is going comes
              looking, and somebody who wants to post another one never has to
              read a percentage on the way. */}
          <Pressable
            onPress={() => navigation.navigate("HostStats")}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={t("nav.stats")}
            hitSlop={8}
          >
            <ChartIcon size={22} color={theme.text2} />
          </Pressable>

        {/* Your face, opening your account — there is no profile page to send
            anyone to, and everything that was on it is in Settings. */}
        <Pressable
          onPress={() => navigation.navigate("Settings")}
          style={styles.avatarTap}
          accessibilityRole="button"
          accessibilityLabel={t("nav.settings")}
        >
          {profile?.avatar_face ? (
            <FaceAvatar id={profile.avatar_face} size={34} />
          ) : (
            <View style={[styles.initial, { backgroundColor: profile?.profile_color || theme.accent }]}>
              <Text style={styles.initialText}>{(name || "?").slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
        </View>
      </View>

      {/* The dashboard scrolls under its own header; this sits above it so the
          button is reachable without scrolling back to the top. */}
      <View style={styles.body}>
        <HostDashboardScreen navigation={navigation} />
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={() => navigation.navigate("Create")}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{`+  ${t("host.newMeeting")}`}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
    backgroundColor: t.surface,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  wordmark: { fontFamily: FONTS.headingExtra, fontSize: t.fs(20), color: t.text, letterSpacing: -0.3 },
  variant: {
    fontFamily: FONTS.accentMedium,
    fontSize: t.fs(11),
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: t.accent,
    backgroundColor: t.accentSoft,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
    overflow: "hidden",
  },
  barRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconBtn: { padding: 2 },
  avatarTap: { borderRadius: RADIUS.pill },
  initial: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  initialText: { fontFamily: FONTS.accent, fontSize: t.fs(14), color: t.accentOn },

  body: { flex: 1 },

  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    backgroundColor: t.surface,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  cta: {
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: t.accent,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.s2,
  },
  ctaPressed: { backgroundColor: t.accentStrong },
  ctaText: { fontFamily: FONTS.accent, fontSize: t.fs(16), color: t.accentOn },
});
