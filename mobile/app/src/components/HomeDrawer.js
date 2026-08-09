import React, { useEffect, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, ScrollView, useWindowDimensions, BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { I18nManager } from "react-native";

import BrandMark from "./BrandMark";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";
import {
  HomeIcon, PlusIcon, UserIcon, PencilIcon, GearIcon,
  ToolsIcon, ClockIcon, LogOutIcon, CloseIcon, CompassIcon, BellIcon, FlagIcon,
} from "./NavIcons";
import { useI18n } from "../context/LocaleContext";

// The web port of templates/home_menu.html: Home has no bottom bar, so this
// drawer holds everything the old nav did. Same items, same order, same
// 82%-wide / 320px-max panel sliding in over a dark scrim.
const DRAWER_MAX_WIDTH = 320;

// Declared once rather than inline, so the stagger index and the route are
// read off the same list instead of being kept in step by hand.
// Same items in the same order as the web drawer (templates/home_menu.html),
// so someone moving between the two finds the menu unchanged.
const NAV_ITEMS = [
  { route: "Home", labelKey: "drawer.home", Icon: HomeIcon },
  { route: "Explore", labelKey: "drawer.explore", Icon: CompassIcon },
  { route: "Activity", labelKey: "drawer.activity", Icon: BellIcon, badgeKey: "activity" },
  { route: "Inbox", labelKey: "drawer.inbox", Icon: BellIcon, badgeKey: "inbox" },
  { route: "Create", labelKey: "drawer.create", Icon: PlusIcon },
  { route: "Profile", labelKey: "drawer.myProfile", Icon: UserIcon },
  { route: "EditProfile", labelKey: "drawer.editProfile", Icon: PencilIcon },
  { route: "Settings", labelKey: "drawer.settings", Icon: GearIcon },
];

const ADMIN_ITEMS = [
  { route: "AdminDashboard", labelKey: "drawer.dashboard", Icon: ToolsIcon },
  { route: "AdminPending", labelKey: "drawer.reviewMeetings", Icon: ClockIcon, badgeKey: "pending" },
  { route: "AdminReports", labelKey: "drawer.reports", Icon: FlagIcon, badgeKey: "reports" },
];

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

/**
 * One nav row. `index` drives the open stagger: rows fade and slide in a beat
 * apart so the panel reads as arriving rather than snapping into place.
 */
function Item({ label, Icon, active, badge, onPress, styles, theme, index = 0, progress, reduceMotion }) {
  // Icons take the row's colour, which is the point of dropping the emoji.
  const tint = active ? theme.accentStrong : theme.text2;

  const rowStyle = reduceMotion
    ? null
    : {
        opacity: progress,
        transform: [
          {
            translateX: progress.interpolate({
              inputRange: [0, 1],
              // Each row starts a little further out, so they land in sequence.
              // Outward is the opposite direction in an RTL layout.
              outputRange: [(I18nManager.isRTL ? 1 : -1) * (14 + index * 4), 0],
            }),
          },
        ],
      };

  return (
    <Animated.View style={rowStyle}>
      <Pressable
        style={[styles.item, active && styles.itemActive]}
        onPress={onPress}
        android_ripple={{ color: theme.surface3 }}
      >
        <View style={styles.itemIcon}>
          <Icon size={20} color={tint} />
        </View>
        <Text style={[styles.itemLabel, active && styles.itemLabelActive]}>{label}</Text>
        <View style={{ flex: 1 }} />
        {badge ? <Text style={styles.badge}>{badge > 99 ? "99+" : String(badge)}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

export default function HomeDrawer({
  open, onClose, navigation, activeRoute, isAdmin, pendingCount,
  activityCount = 0, inboxCount = 0, reportCount = 0, onLogout,
}) {
  const { theme, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { width: screenW } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const width = Math.min(screenW * 0.82, DRAWER_MAX_WIDTH);
  const slide = useRef(new Animated.Value(0)).current;   // 0 closed, 1 open
  // Runs just behind the panel so the rows settle after it, not with it.
  const rows = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      slide.setValue(open ? 1 : 0);
      rows.setValue(open ? 1 : 0);
      return undefined;
    }

    const anim = Animated.parallel([
      // A spring on the way in gives the panel some weight; closing stays a
      // plain timing curve, because a bouncing dismissal reads as indecision.
      open
        ? Animated.spring(slide, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 4 })
        : Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(rows, {
        toValue: open ? 1 : 0,
        duration: open ? 260 : 140,
        delay: open ? 90 : 0,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [open, slide, rows, reduceMotion]);

  // Android back button closes the drawer instead of leaving the screen
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  // Off-screen is to the left in LTR and to the right in RTL.
  const hidden = I18nManager.isRTL ? width + 8 : -(width + 8);
  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [hidden, 0],
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
          {/* Same mark as the launcher icon — see components/BrandMark.js. The
              drawer sits on `surface`, not `bg`, so the lens takes that. */}
          <View style={styles.logo}>
            <BrandMark size={44} color={theme.accent} bg={theme.surface} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Metz</Text>
            <Text style={styles.sub}>{t("drawer.tagline")}</Text>
          </View>
          <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
            <CloseIcon size={16} color={theme.text2} />
          </Pressable>
        </View>

        <ScrollView style={styles.nav} contentContainerStyle={{ paddingBottom: 8 }}>
          {NAV_ITEMS.map((item, i) => (
            <Item
              key={item.route}
              label={t(item.labelKey)}
              Icon={item.Icon}
              active={activeRoute === item.route}
              badge={item.badgeKey === "activity" ? activityCount : item.badgeKey === "inbox" ? inboxCount : 0}
              onPress={() => go(item.route)}
              index={i}
              progress={rows}
              reduceMotion={reduceMotion}
              styles={styles}
              theme={theme}
            />
          ))}

          {isAdmin ? (
            <>
              <View style={styles.divider}>
                <Text style={styles.dividerText}>ADMIN</Text>
                <View style={styles.dividerLine} />
              </View>
              {ADMIN_ITEMS.map((item, i) => (
                <Item
                  key={item.route}
                  label={t(item.labelKey)}
                  Icon={item.Icon}
                  active={activeRoute === item.route}
                  badge={item.badgeKey === "reports" ? reportCount : pendingCount}
                  onPress={() => go(item.route)}
                  index={NAV_ITEMS.length + i}
                  progress={rows}
                  reduceMotion={reduceMotion}
                  styles={styles}
                  theme={theme}
                />
              ))}
            </>
          ) : null}
        </ScrollView>

        <Pressable style={styles.logout} onPress={() => { onClose(); onLogout(); }}>
          <LogOutIcon size={19} color="#e74c3c" />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

const makeStyles = (t) => StyleSheet.create({
  // ── Floating pill on the map (.map-menu-btn) ─────────────────────────
  menuBtn: {
    position: "absolute",
    start: 14,
    zIndex: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingStart: 12,
    paddingEnd: 14,
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
    marginStart: 2,
  },

  // ── Scrim + panel ────────────────────────────────────────────────────
  scrim: { ...StyleSheet.absoluteFillObject, zIndex: 900, backgroundColor: "rgba(10, 14, 24, 0.45)" },
  drawer: {
    position: "absolute",
    top: 0,
    start: 0,
    bottom: 0,
    zIndex: 950,
    backgroundColor: t.surface,
    borderEndWidth: 1,
    borderEndColor: t.border,
    ...SHADOW.s3,
  },

  head: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  // The mark is 3:2 and sizes itself; the row just needs it vertically centred.
  logo: { justifyContent: "center" },
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
  itemIcon: { width: 22, alignItems: "center", justifyContent: "center" },
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
    gap: 13,
    marginHorizontal: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: "rgba(231, 76, 60, 0.08)",
  },
  logoutText: { color: "#e74c3c", fontSize: 14.5, fontWeight: "700" },
});
