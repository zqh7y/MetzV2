import React, { useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import TrustBadge from "./TrustBadge";
import MiniMap from "./MiniMap";
import { MapPinIcon, GlobeIcon, UserIcon } from "./NavIcons";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { formatWhen } from "../utils/time";
import { CARD_GRADIENTS } from "../styles/theme";

// .foryou-card: flex 0 0 205px, 12px padding, 16px radius.
const CARD_WIDTH = 205;
const CARD_PAD = 12;
const MAP_HEIGHT = 84;    // .foryou-map

/**
 * Every card is the same height.
 *
 * On the web the shelf is a flex row, so `align-items: stretch` already makes
 * each card as tall as the tallest and `.foryou-card-desc { flex: 1 }` soaks up
 * the slack. A horizontal FlatList sizes each item to its own content instead,
 * so the height is pinned here and the description keeps the same flex:1 job —
 * which is what stops a card without a map, or with a one-line title, from
 * standing shorter than its neighbours.
 */
const CARD_HEIGHT = 320;

// Same five-colour rotation the web shelf uses (.card-color-0…4), now shared
// with the list cards from styles/theme so one meeting keeps one colour.
const GRADIENTS = CARD_GRADIENTS;

function ForYouCard({ meeting, index, onPress, onJoin, onPass }) {
  const isOnline = meeting.type === "OnlineMeeting";
  const colors = GRADIENTS[index % GRADIENTS.length];
  const { theme, scheme, minimaps, reduceMotion } = useTheme();

  // Same rule as the web: only in-person meetings have somewhere to show, and
  // the whole strip disappears when the "Live maps" preference is off.
  const showMap =
    minimaps !== "off" && !isOnline &&
    typeof meeting.lat === "number" && typeof meeting.lng === "number";

  // As in MeetingCard: hand the meeting back so the shelf can pass one stable
  // callback per action rather than a closure per card.
  const press = useCallback(() => onPress?.(meeting), [onPress, meeting]);
  const join = useCallback(() => onJoin?.(meeting), [onJoin, meeting]);
  const pass = useCallback(() => onPass?.(meeting), [onPass, meeting]);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={press}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        {showMap ? (
          <MiniMap
            lat={meeting.lat}
            lng={meeting.lng}
            width={CARD_WIDTH - CARD_PAD * 2}
            height={MAP_HEIGHT}
            accent={theme.accent}
            glow={theme.accentGlow}
            dark={scheme === "dark"}
            reduceMotion={reduceMotion}
            style={styles.map}
          />
        ) : null}
        {/* Icons and date formatting match the list cards below the shelf —
            the two used to disagree, one showing "📍 In-Person" and a raw
            "2026-08-06 12:00" while the other read "Thu 6 Aug · 12:00". */}
        <View style={styles.badge}>
          {isOnline
            ? <GlobeIcon size={11} color="#fff" />
            : <MapPinIcon size={11} color="#fff" />}
          <Text style={styles.badgeText}>{isOnline ? "Online" : "In-Person"}</Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>{meeting.title}</Text>
        <Text style={styles.time} numberOfLines={1}>{formatWhen(meeting.time)}</Text>

        {isOnline || meeting.short_location ? (
          <View style={styles.placeRow}>
            {isOnline
              ? <GlobeIcon size={11} color="rgba(255,255,255,0.9)" />
              : <MapPinIcon size={11} color="rgba(255,255,255,0.9)" />}
            <Text style={styles.place} numberOfLines={1}>
              {isOnline ? "Online" : meeting.short_location}
            </Text>
          </View>
        ) : null}

        <Text style={styles.desc} numberOfLines={2}>{meeting.description}</Text>

        {meeting.creator_username ? (
          <View style={styles.creatorRow}>
            <UserIcon size={11} color="rgba(255,255,255,0.9)" />
            <Text style={styles.creator} numberOfLines={1}>{meeting.creator_username}</Text>
            {meeting.creator_is_trusted ? <TrustBadge /> : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.passBtn]} onPress={pass}>
            <Text style={styles.passText}>✕  Pass</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.joinBtn]} onPress={join}>
            <Text style={styles.joinText}>✓  Join</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// Each of these owns a MiniMap that fetches its own tiles, so a needless
// re-render is not just wasted layout — it re-runs the tile maths for every
// card in the shelf.
export default React.memo(ForYouCard, (a, b) => (
  a.meeting.id === b.meeting.id
  && a.meeting.title === b.meeting.title
  && a.meeting.lat === b.meeting.lat
  && a.meeting.lng === b.meeting.lng
  && a.index === b.index
  && a.onPress === b.onPress
  && a.onJoin === b.onJoin
  && a.onPass === b.onPass
));

const styles = StyleSheet.create({
  // .foryou-map sits inside the card's padding, not flush to its edges.
  map: { marginBottom: 10 },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    padding: CARD_PAD,
    marginRight: 12,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  // Now a row (icon + label) rather than a single Text, so the colour and font
  // move to badgeText and the container keeps only the pill.
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: "hidden",
  },
  badgeText: { color: "#fff", fontSize: 10, fontFamily: FONTS.accent },
  title: { color: "#fff", fontFamily: FONTS.headingExtra, fontSize: 15, lineHeight: 19, marginTop: 8 },
  time: { color: "#fff", fontSize: 11.5, fontFamily: FONTS.accentMedium, marginTop: 3 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  place: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontFamily: FONTS.bodySemi, flexShrink: 1 },
  // flex: 1 — the slack between a short card and a tall one collects here, the
  // same way .foryou-card-desc absorbs it on the web.
  desc: { color: "rgba(255,255,255,0.92)", fontSize: 12, lineHeight: 16, marginTop: 7, flex: 1 },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  creator: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontFamily: FONTS.bodySemi, flexShrink: 1 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: "center" },
  passBtn: { backgroundColor: "rgba(255,255,255,0.2)" },
  joinBtn: { backgroundColor: "#fff" },
  passText: { color: "#fff", fontSize: 12, fontFamily: FONTS.accent },
  joinText: { color: "#2c3e50", fontSize: 12, fontFamily: FONTS.accent },
});
