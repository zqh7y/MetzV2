import React, { useEffect, useMemo, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, ScrollView, useWindowDimensions, BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { I18nManager } from "react-native";

import { LinearGradient } from "expo-linear-gradient";

import BrandMark from "./BrandMark";
import ProfileAvatar from "./ProfileAvatar";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";
import {
  HomeIcon, PlusIcon, GearIcon, CompassIcon,
  ToolsIcon, ClockIcon, LogOutIcon, CloseIcon, BellIcon, FlagIcon, ChartIcon,
} from "./NavIcons";
import { useI18n } from "../context/LocaleContext";

// The web port of templates/home_menu.html: Home has no bottom bar, so this
// drawer holds everything the old nav did. Same items, same order, same
// 82%-wide / 320px-max panel sliding in over a dark scrim.
const DRAWER_MAX_WIDTH = 320;

// Declared once rather than inline, so the stagger index and the route are
// read off the same list instead of being kept in step by hand.
//
// Five destinations, down from eight. The three that went were not extra
// features but extra doors onto things the remaining screens already own:
// Explore is the same meetings Home maps, Activity is the same "from Metz"
// stream as the Inbox, and Edit Profile edits precisely what Profile displays.
// Each is now a section of the screen it belongs to, so the menu lists places
// rather than views. Deliberately no longer mirrors the web drawer
// (templates/home_menu.html), which still has all eight.
const NAV_ITEMS = [
  { route: "Home", labelKey: "drawer.home", Icon: HomeIcon },
  // Home already holds Explore as a tab; `route.params.tab` is how the
  // rest of the app asks for that side directly, so this is a real
  // destination rather than a row added to fill the panel.
  { route: "Home", params: { tab: "explore" }, key: "Explore",
    labelKey: "drawer.explore", Icon: CompassIcon },
  { route: "Inbox", labelKey: "drawer.inbox", Icon: BellIcon, badgeKey: "inbox" },
  { route: "Create", labelKey: "drawer.create", Icon: PlusIcon },
  // Shown to everyone rather than only to people who have hosted something:
  // it is how organising is discovered, and a row that appears only once you
  // are already an organiser cannot tell anybody that the figures exist. The
  // screen says so plainly when there is nothing to show yet.
  { route: "HostDashboard", labelKey: "drawer.hostDashboard", Icon: ChartIcon },
  { route: "Settings", labelKey: "drawer.settings", Icon: GearIcon },
];

const ADMIN_ITEMS = [
  { route: "AdminDashboard", labelKey: "drawer.dashboard", Icon: ToolsIcon },
  { route: "AdminPending", labelKey: "drawer.reviewMeetings", Icon: ClockIcon, badgeKey: "pending" },
  { route: "AdminReports", labelKey: "drawer.reports", Icon: FlagIcon, badgeKey: "reports" },
];

/**
 * The one control floating over the map, so it is the only thing on that
 * screen that can look like the app rather than like a default.
 *
 * Three changes from the flat dark pill it was. The bars are tapered and the
 * short one carries the accent, which turns a generic hamburger into a mark
 * that belongs to this app and changes with the colour someone picked. The
 * fill is a gradient rather than one flat navy, so it reads as a raised object
 * over a busy map instead of a sticker. And it presses in, because a button
 * sitting on top of a map that moves under your finger should answer the touch
 * it got.
 */
export function MenuButton({ onPress, showDot }) {
  const { theme, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const press = useRef(new Animated.Value(0)).current;
  const animate = (to) => {
    if (reduceMotion) return;
    Animated.spring(press, {
      toValue: to, useNativeDriver: true, speed: 40, bounciness: 6,
    }).start();
  };
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });

  return (
    <Animated.View
      style={[styles.menuWrap, { top: insets.top + 14, transform: [{ scale }] }]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => animate(1)}
        onPressOut={() => animate(0)}
        hitSlop={8}
      >
        <LinearGradient
          colors={["rgba(44, 44, 68, 0.94)", "rgba(20, 20, 36, 0.94)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.menuBtn}
        >
          {/* Drawn rather than pulled in as an icon font, so the short bar can
              take the accent and the weights stay ours. */}
          <View style={styles.burger}>
            <View style={styles.burgerLine} />
            <View style={styles.burgerLine} />
            <View style={[styles.burgerLine, styles.burgerLineShort]} />
          </View>
          <Text style={styles.menuBrand}>Metz</Text>
          {showDot ? <View style={styles.menuDot} /> : null}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

/**
 * One nav row. `index` drives the open stagger: rows fade and slide in a beat
 * apart so the panel reads as arriving rather than snapping into place.
 */
function Item({ label, Icon, badge, onPress, styles, theme, index = 0, progress, reduceMotion }) {
  // Icons take the row's colour, which is the point of dropping the emoji.
  const tint = theme.text2;

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
        style={styles.item}
        onPress={onPress}
        android_ripple={{ color: theme.surface3 }}
      >
        <View style={styles.itemIcon}>
          <Icon size={20} color={tint} />
        </View>
        <Text style={styles.itemLabel}>{label}</Text>
        <View style={{ flex: 1 }} />
        {badge ? <Text style={styles.badge}>{badge > 99 ? "99+" : String(badge)}</Text> : null}
      </Pressable>
    </Animated.View>
  );
}

export default function HomeDrawer({
  open, onClose, navigation, activeRoute, isAdmin, pendingCount,
  activityCount = 0, inboxCount = 0, reportCount = 0, onLogout, profile,
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

  function go(route, params) {
    onClose();
    // With params this is a request for a particular side of a screen you may
    // already be on — Explore when Home is showing Nearby — so the "same
    // route, skip it" shortcut would swallow it.
    if (params) {
      navigation.navigate(route, params);
      return;
    }
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
          {profile ? (
            <Pressable style={styles.account} onPress={() => go("Profile")}>
              <ProfileAvatar
                size={42}
                frame={profile.profile_frame}
                face={profile.avatar_face}
                emoji={profile.avatar_emoji}
                initials={(profile.display_name || profile.username || "?").slice(0, 2).toUpperCase()}
                color={profile.profile_color}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.accountName} numberOfLines={1}>
                  {profile.display_name || profile.username}
                </Text>
                <Text style={styles.accountUid} numberOfLines={1}>@{profile.uid}</Text>
              </View>
            </Pressable>
          ) : <View style={{ flex: 1 }} />}
          <Pressable style={styles.close} onPress={onClose} hitSlop={8}>
            <CloseIcon size={16} color={theme.text2} />
          </Pressable>
        </View>

        <ScrollView style={styles.nav} contentContainerStyle={{ paddingBottom: 8 }}>
          {NAV_ITEMS.map((item, i) => (
            <Item
              key={item.key || item.route}
              label={t(item.labelKey)}
              Icon={item.Icon}
              /* Activity moved inside the Inbox screen, so its count moved
                 into the Inbox badge too — split across two rows it told you
                 how much was waiting; on one row that has to be the total, or
                 the badge undercounts what is actually behind the tap. */
              badge={item.badgeKey === "inbox" ? inboxCount + activityCount : 0}
              onPress={() => go(item.route, item.params)}
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
                <Text style={styles.dividerText}>{t("drawer.admin")}</Text>
                <View style={styles.dividerLine} />
              </View>
              {ADMIN_ITEMS.map((item, i) => (
                <Item
                  key={item.route}
                  label={t(item.labelKey)}
                  Icon={item.Icon}
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
          {/* Was hardcoded English, so this one row stayed "Log out" while the
              five above it were in Hebrew, Arabic or Russian. The key already
              existed and was translated everywhere — only this call site never
              used it. */}
          <Text style={styles.logoutText}>{t("account.logOut")}</Text>
        </Pressable>

        <View style={styles.brandFoot}>
          {/* Same mark as the launcher icon — see components/BrandMark.js. The
              drawer sits on `surface`, not `bg`, so the lens takes that. */}
          <BrandMark size={30} color={theme.accent} bg={theme.surface} />
          <View>
            <Text style={styles.brandName}>Metz</Text>
            <Text style={styles.sub}>{t("drawer.tagline")}</Text>
          </View>
        </View>
      </Animated.View>
    </>
  );
}

const makeStyles = (t) => StyleSheet.create({
  // ── Floating pill on the map (.map-menu-btn) ─────────────────────────
  // The position lives on the wrapper so the transform has something to scale
  // that is not also the thing being laid out.
  menuWrap: { position: "absolute", start: 14, zIndex: 6, borderRadius: 22, ...SHADOW.s2 },
  menuBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    paddingStart: 12,
    paddingEnd: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    overflow: "hidden",
  },
  burger: { width: 18, height: 12, justifyContent: "space-between" },
  burgerLine: { height: 2.4, borderRadius: 2, backgroundColor: "#fff" },
  // Tapered, and in the accent: the detail that stops it being the same three
  // bars every app draws, and the one part that follows the chosen colour.
  burgerLineShort: { width: 11, backgroundColor: t.accent },
  menuBrand: { color: "#fff", fontSize: t.fs(13.5), fontFamily: FONTS.heading },
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
  account: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  accountName: { fontSize: t.fs(15), fontFamily: FONTS.headingSemi, color: t.text },
  accountUid: { fontSize: t.fs(11.5), color: t.text3, fontFamily: FONTS.accentMedium, marginTop: 2 },
  brandFoot: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingTop: 14, marginTop: 6,
    borderTopWidth: 1, borderTopColor: t.border,
  },
  brandName: { fontSize: t.fs(14), fontFamily: FONTS.heading, color: t.text2 },
  // The mark is 3:2 and sizes itself; the row just needs it vertically centred.
  logo: { justifyContent: "center" },
  title: { fontSize: t.fs(17), fontFamily: FONTS.heading, color: t.text },
  sub: { fontSize: t.fs(12), color: t.text2 },
  close: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    backgroundColor: t.surface2,
  },
  closeText: { color: t.text2, fontSize: t.fs(14), fontWeight: "700" },

  nav: { flex: 1, paddingHorizontal: 12 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 15,
    paddingHorizontal: 14,
    borderRadius: 13,
    overflow: "hidden",
  },
  itemIcon: { width: 22, alignItems: "center", justifyContent: "center" },
  itemLabel: { fontSize: t.fs(14.5), fontWeight: "600", color: t.text },
  badge: {
    minWidth: 22,
    textAlign: "center",
    borderRadius: RADIUS.pill,
    backgroundColor: t.status.bad,
    color: "#fff",
    fontSize: t.fs(11),
    fontFamily: FONTS.accent,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: "hidden",
  },

  divider: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 6 },
  dividerText: { fontSize: t.fs(11), fontWeight: "700", letterSpacing: 0.5, color: t.text3 },
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
  logoutText: { color: "#e74c3c", fontSize: t.fs(14.5), fontWeight: "700" },
});
