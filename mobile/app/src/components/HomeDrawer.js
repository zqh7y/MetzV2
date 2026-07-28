import React, { useEffect, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, ScrollView, useWindowDimensions, BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";

// The web port of templates/home_menu.html: Home has no bottom bar, so this
// drawer holds everything the old nav did. Same items, same order, same
// 82%-wide / 320px-max panel sliding in over a dark scrim.
const DRAWER_MAX_WIDTH = 320;

export function MenuButton({ onPress, showDot }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Pressable style={[styles.menuBtn, { top: insets.top + 14 }]} onPress={onPress} hitSlop={8}>
      {/* Three bars, drawn rather than pulled in as an icon font */}
      <View style={styles.burger}>
        <View style={styles.burgerLine} />
        <View style={styles.burgerLine} />
        <View style={styles.burgerLine} />
      </View>
      <Text style={styles.menuBrand}>Metz</Text>
      {showDot ? <View style={styles.menuDot} /> : null}
    </Pressable>
  );
}

function Item({ label, icon, active, badge, onPress, styles, theme }) {
  return (
    <Pressable
      style={[styles.item, active && styles.itemActive]}
      onPress={onPress}
      android_ripple={{ color: theme.surface3 }}
    >
      <Text style={styles.itemIcon}>{icon}</Text>
      <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{label}</Text>
      <View style={{ flex: 1 }} />
      {badge ? <Text style={styles.badge}>{badge > 99 ? "99+" : String(badge)}</Text> : null}
    </Pressable>
  );
}

export default function HomeDrawer({ open, onClose, navigation, activeRoute, isAdmin, pendingCount, onLogout }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const width = Math.min(screenW * 0.82, DRAWER_MAX_WIDTH);
  const slide = useRef(new Animated.Value(0)).current;   // 0 closed, 1 open

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: open ? 320 : 260,
      useNativeDriver: true,
    }).start();
  }, [open, slide]);

  // Android back button closes the drawer instead of leaving the screen
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [-(width + 8), 0],
  });

  function go(route) {
    onClose();
    if (route !== activeRoute) navigation.navigate(route);
  }

  return (
    <>
      {/* Scrim: mounted only while open so it never swallows taps on the map */}
      {open ? (
        <Animated.View style={[styles.scrim, { opacity: slide }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
      ) : null}

      <Animated.View
        pointerEvents={open ? "auto" : "none"}
        style={[styles.drawer, { width, paddingBottom: insets.bottom + 16, transform: [{ translateX }] }]}
      >
        <View style={[styles.head, { paddingTop: insets.top + 16 }]}>
          <LinearGradient
            colors={[theme.accent, theme.accentStrong]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.logo}
          >
            <Text style={styles.logoText}>M</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Metz</Text>
            <Text style={styles.sub}>Meet people nearby</Text>
          </View>
          <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.nav} contentContainerStyle={{ paddingBottom: 8 }}>
          <Item label="Home" icon="🏠" active={activeRoute === "Home"}
                onPress={() => go("Home")} styles={styles} theme={theme} />
          <Item label="Create a meeting" icon="➕" active={activeRoute === "Create"}
                onPress={() => go("Create")} styles={styles} theme={theme} />
          <Item label="My profile" icon="👤" active={activeRoute === "Profile"}
                onPress={() => go("Profile")} styles={styles} theme={theme} />
          <Item label="Edit profile" icon="✏️" active={activeRoute === "EditProfile"}
                onPress={() => go("EditProfile")} styles={styles} theme={theme} />
          <Item label="Settings" icon="⚙️" active={activeRoute === "Settings"}
                onPress={() => go("Settings")} styles={styles} theme={theme} />

          {isAdmin ? (
            <>
              <View style={styles.divider}>
                <Text style={styles.dividerText}>ADMIN</Text>
                <View style={styles.dividerLine} />
              </View>
              <Item label="Dashboard" icon="🛠️" active={activeRoute === "AdminDashboard"}
                    onPress={() => go("AdminDashboard")} styles={styles} theme={theme} />
              <Item label="Review meetings" icon="⏳" badge={pendingCount}
                    onPress={() => go("AdminPending")} styles={styles} theme={theme} />
            </>
          ) : null}
        </ScrollView>

        <Pressable style={styles.logout} onPress={() => { onClose(); onLogout(); }}>
          <Text style={styles.logoutText}>⇥  Log out</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

const makeStyles = (t) => StyleSheet.create({
  // ── Floating pill on the map (.map-menu-btn) ─────────────────────────
  menuBtn: {
    position: "absolute",
    left: 14,
    zIndex: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: 22,
    backgroundColor: "rgba(28, 28, 46, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    ...SHADOW.s2,
  },
  burger: { width: 18, height: 12, justifyContent: "space-between" },
  burgerLine: { height: 2.4, borderRadius: 2, backgroundColor: "#fff" },
  menuBrand: { color: "#fff", fontSize: 13.5, fontFamily: FONTS.heading },
  menuDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: t.status.bad,
    marginLeft: 2,
  },

  // ── Scrim + panel ────────────────────────────────────────────────────
  scrim: { ...StyleSheet.absoluteFillObject, zIndex: 900, backgroundColor: "rgba(10, 14, 24, 0.45)" },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 950,
    backgroundColor: t.surface,
    borderRightWidth: 1,
    borderRightColor: t.border,
    ...SHADOW.s3,
  },

  head: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  logo: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 20, fontFamily: FONTS.heading },
  title: { fontSize: 17, fontFamily: FONTS.heading, color: t.text },
  sub: { fontSize: 12, color: t.text2 },
  close: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    backgroundColor: t.surface2,
  },
  closeText: { color: t.text2, fontSize: 14, fontWeight: "700" },

  nav: { flex: 1, paddingHorizontal: 12 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 13,
    overflow: "hidden",
  },
  itemActive: { backgroundColor: t.accentSoft },
  itemIcon: { fontSize: 17, width: 22, textAlign: "center" },
  itemLabel: { fontSize: 14.5, fontWeight: "600", color: t.text },
  itemLabelActive: { color: t.accentStrong, fontFamily: FONTS.headingSemi },
  badge: {
    minWidth: 22,
    textAlign: "center",
    borderRadius: RADIUS.pill,
    backgroundColor: t.status.bad,
    color: "#fff",
    fontSize: 11,
    fontFamily: FONTS.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: "hidden",
  },

  divider: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 6 },
  dividerText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: t.text3 },
  dividerLine: { flex: 1, height: 1, backgroundColor: t.border },

  logout: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: "rgba(231, 76, 60, 0.08)",
  },
  logoutText: { color: "#e74c3c", fontSize: 14.5, fontWeight: "700" },
});
