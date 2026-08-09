import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import TrustBadge from "./TrustBadge";
import AvatarStack from "./AvatarStack";
import ThresholdBar from "./ThresholdBar";
import AnimatedPressable from "./AnimatedPressable";
import { MapPinIcon, GlobeIcon, TagIcon } from "./NavIcons";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { formatWhen, formatRelative } from "../utils/time";
import { CARD_GRADIENTS, RADIUS, SHADOW } from "../styles/theme";
import { useI18n } from "../context/LocaleContext";
import { localizedTag } from "../i18n/vocab";

/**
 * A meeting in the Nearby list.
 *
 * The previous shape was a flat block of left-aligned text with a 5px colour
 * stripe down one edge — legible, but nothing for the eye to catch, so twenty
 * of them read as one grey column. The card is now built around a leading
 * gradient tile carrying the meeting's own emoji: it gives every row an object
 * to land on, makes the list scannable by picture rather than by reading each
 * title, and finally uses the `emoji` field, which the list had been throwing
 * away even though every organiser picks one.
 *
 * The zones are deliberate — identity (tile + title + when), then context
 * (badges, threshold, blurb), then the social proof and the action, separated
 * by a rule. Previously all three ran together as one stack.
 */
// Past three the names stop fitting one line; the overflow becomes "+N".
const MAX_TAGS = 3;

function MeetingCard({ meeting, index = 0, distance, onPress, onJoin, onDelete }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const isOnline = meeting.type === "OnlineMeeting";

  /**
   * Every interest on one line: "Sports · Social", or "Art · Fitness · Social
   * +9" once there are more than three.
   *
   * Three is where a single line still fits the narrowest card without
   * truncating mid-word; past that the count carries more than a clipped
   * fourth name would. Tags are translated on the way out — they are stored as
   * the English word (AVAILABLE_TAGS in utils/models.py), not as an id.
   */
  const tagLine = useMemo(() => {
    const tags = meeting.tags || [];
    if (!tags.length) return "";
    const shown = tags.slice(0, MAX_TAGS).map((tag) => localizedTag(t, tag));
    const rest = tags.length - shown.length;
    return shown.join(" · ") + (rest > 0 ? `  +${rest}` : "");
  }, [meeting.tags, t]);
  const ramp = CARD_GRADIENTS[index % CARD_GRADIENTS.length];

  // The card hands its own meeting back, so a list can pass one stable
  // callback for every row instead of building a fresh closure per item.
  const press = useCallback(() => onPress?.(meeting), [onPress, meeting]);
  const join = useCallback(() => onJoin?.(meeting), [onJoin, meeting]);
  const remove = useCallback(() => onDelete?.(meeting), [onDelete, meeting]);

  const when = formatWhen(meeting.time);
  const relative = formatRelative(meeting.time);
  const started = relative === "Started";
  const place = isOnline ? t("common.online") : meeting.short_location;
  const going = meeting.joined_count || 0;

  return (
    <AnimatedPressable style={styles.card} onPress={press} scaleTo={0.98}>
      {/* ── Identity ─────────────────────────────────────────────────── */}
      <View style={styles.head}>
        <LinearGradient
          colors={ramp}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.tile}
        >
          <Text style={styles.tileEmoji}>{meeting.emoji || (isOnline ? "🌐" : "📍")}</Text>
        </LinearGradient>

        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={2}>{meeting.title}</Text>
          <Text style={styles.when} numberOfLines={1}>{when}</Text>
          {place ? (
            <View style={styles.placeRow}>
              {isOnline
                ? <GlobeIcon size={12} color={theme.text3} />
                : <MapPinIcon size={12} color={theme.text3} />}
              <Text style={styles.place} numberOfLines={1}>{place}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Context ──────────────────────────────────────────────────────
          Two rows, not one wrapped pile. The first says what this meeting *is*
          right now — online or not, how soon, how far — and those three are
          the ones people scan. Interests used to sit in the same wrap, one
          chip each, so a meeting tagged with ten of them pushed the status
          badges onto their own line and buried them under a wall of grey
          pills. They are one chip now, and they read as a caption rather than
          competing with the status. */}
      <View style={styles.chipRow}>
        <View style={[styles.chip, isOnline ? styles.chipOnline : styles.chipInPerson]}>
          <Text style={[styles.chipText, isOnline ? styles.chipTextOnline : styles.chipTextInPerson]}>
            {isOnline ? t("common.online") : t("common.inPerson")}
          </Text>
        </View>
        <View style={[styles.chip, styles.chipTime, started && styles.chipStarted]}>
          <Text style={[styles.chipText, styles.chipTimeText, started && styles.chipStartedText]}>
            {relative}
          </Text>
        </View>
        {distance ? (
          <View style={[styles.chip, styles.chipDistance]}>
            <Text style={[styles.chipText, styles.chipDistanceText]}>{distance}</Text>
          </View>
        ) : null}
      </View>

      {tagLine ? (
        <View style={styles.tagChip}>
          <TagIcon size={11} color={theme.text3} />
          <Text style={styles.tagChipText} numberOfLines={1}>{tagLine}</Text>
        </View>
      ) : null}

      <ThresholdBar meeting={meeting} />

      {meeting.description ? (
        <Text style={styles.desc} numberOfLines={2}>{meeting.description}</Text>
      ) : null}

      {/* ── Who's going, and the way in ──────────────────────────────── */}
      <View style={styles.rule} />

      <View style={styles.footer}>
        <AvatarStack people={meeting.joined_preview} total={going} size={26} />
        <View style={styles.goingWrap}>
          <Text style={styles.going} numberOfLines={1}>
            {going === 0 ? t("card.beTheFirst") : t("card.going", { count: going })}
          </Text>
          {meeting.creator_username ? (
            <View style={styles.creatorRow}>
              <Text style={styles.creator} numberOfLines={1}>by {meeting.creator_username}</Text>
              {meeting.creator_is_trusted ? <TrustBadge /> : null}
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.joinBtn, meeting.is_joined && styles.joinBtnActive]}
          onPress={join}
          activeOpacity={0.85}
        >
          <Text style={[styles.joinBtnText, meeting.is_joined && styles.joinBtnTextActive]}>
            {meeting.is_joined ? t("card.joined") : t("card.join")}
          </Text>
        </TouchableOpacity>

        {meeting.can_delete && onDelete ? (
          <TouchableOpacity style={styles.deleteBtn} onPress={remove}>
            <Text style={styles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

/**
 * Memoised on what the card actually draws.
 *
 * A list of these re-rendered in full whenever anything on Home changed — a
 * keystroke in the search box, a GPS update, joining an unrelated meeting.
 * The default shallow compare would not have helped, because `meeting` is a
 * fresh object on every fetch; comparing the fields that are visible means a
 * card only repaints when its own content moved.
 */
export default React.memo(MeetingCard, (a, b) => (
  a.meeting.id === b.meeting.id
  && a.meeting.is_joined === b.meeting.is_joined
  && a.meeting.joined_count === b.meeting.joined_count
  && a.meeting.title === b.meeting.title
  && a.meeting.time === b.meeting.time
  && a.meeting.emoji === b.meeting.emoji
  && a.meeting.description === b.meeting.description
  && a.meeting.short_location === b.meeting.short_location
  && a.meeting.can_delete === b.meeting.can_delete
  && a.meeting.commit_status === b.meeting.commit_status
  && a.meeting.threshold_progress === b.meeting.threshold_progress
  && a.meeting.joined_preview === b.meeting.joined_preview
  && a.distance === b.distance
  && a.index === b.index
  && a.onPress === b.onPress
  && a.onJoin === b.onJoin
  && a.onDelete === b.onDelete
));

const makeStyles = (t) => StyleSheet.create({
  card: {
    backgroundColor: t.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.border,
    padding: 14,
    marginBottom: 12,
    ...SHADOW.s1,
  },

  head: { flexDirection: "row", gap: 12 },
  // The one strong shape on the card: 56px is big enough to read as a symbol
  // rather than an icon, and it is what makes the list scannable while
  // scrolling past.
  // No shadow of its own. Every elevated view costs Android a separate shadow
  // pass, and three per card (card + tile + Join) across a scrolling list was
  // a measurable share of the frame budget. The card's own shadow carries the
  // depth; the tile reads as raised from its colour alone.
  tile: {
    width: 56,
    height: 56,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  tileEmoji: { fontSize: 26 },
  headText: { flex: 1, minWidth: 0, justifyContent: "center" },
  title: { fontSize: 17, fontFamily: FONTS.heading, color: t.text, lineHeight: 21 },
  when: { fontSize: 12.5, fontFamily: FONTS.accentMedium, color: t.text2, marginTop: 3 },
  placeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  place: { flexShrink: 1, fontSize: 12, color: t.text3 },

  // Every secondary fact is a chip on one wrapping row, instead of each
  // claiming its own line and stretching the card.
  // 8pt between badges rather than 6, and more air above the row: at 6 the
  // three status chips read as one segmented control instead of three facts.
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 },

  // Interests sit on their own line, borderless and quiet — a caption under
  // the status row, deliberately not a fourth badge competing with it.
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    maxWidth: "100%",
    marginTop: 9,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: RADIUS.pill,
    backgroundColor: t.surface2,
  },
  tagChipText: { flexShrink: 1, fontSize: 10.5, fontFamily: FONTS.bodyMedium, color: t.text2 },

  chip: { borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 3.5 },
  chipText: { fontSize: 10.5, fontFamily: FONTS.accent },
  chipInPerson: { backgroundColor: t.accentSoft },
  chipOnline: { backgroundColor: t.surface3 },
  chipTextInPerson: { color: t.accentStrong },
  chipTextOnline: { color: t.text2 },
  chipTime: { backgroundColor: t.surface2 },
  chipTimeText: { color: t.text2 },
  chipStarted: { backgroundColor: t.status.warnSoft },
  chipStartedText: { color: t.status.warn },
  chipDistance: { backgroundColor: t.accentSoft },
  chipDistanceText: { color: t.accentStrong },

  desc: { fontSize: 13, color: t.text2, marginTop: 9, lineHeight: 18 },

  rule: { height: 1, backgroundColor: t.border, marginTop: 12 },

  footer: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 11 },
  goingWrap: { flex: 1, minWidth: 0 },
  going: { fontSize: 12.5, fontFamily: FONTS.bodySemi, color: t.text },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  creator: { fontSize: 11.5, color: t.text3, flexShrink: 1 },
  // Also unshadowed, for the same reason — a solid accent pill on a white card
  // already stands out without a glow behind it.
  joinBtn: {
    borderRadius: RADIUS.pill,
    paddingHorizontal: 20,
    paddingVertical: 9,
    backgroundColor: t.accent,
  },
  joinBtnActive: { backgroundColor: t.surface3 },
  joinBtnText: { fontSize: 13, fontFamily: FONTS.accent, color: t.accentOn },
  joinBtnTextActive: { color: t.text2 },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: t.status.bad, fontFamily: FONTS.accent },
});
