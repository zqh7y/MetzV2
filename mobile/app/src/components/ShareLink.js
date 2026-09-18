import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Share } from "react-native";
import * as Clipboard from "expo-clipboard";

import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import { API_BASE_URL as SHARE_BASE_URL } from "../config";

/**
 * The link, and the two things anyone ever does with it.
 *
 * Sending the link is what Metz Host is *for*, and until this existed the link
 * appeared exactly once — on the screen shown immediately after creating a
 * meeting, which is the one moment an organiser is least likely to have decided
 * where to post it. Every screen after that showed how the link was doing
 * without offering the link: the insights page counts who opened it, says how
 * many came from it, and gave you no way to send it again.
 *
 * So it lives here, once, and the screens that need it ask for it.
 *
 * The server builds the URL from the host the request arrived on, so it follows
 * a custom domain the day one is pointed at the API; SHARE_BASE_URL is only the
 * fallback for a record fetched before that field existed.
 */
export function shareUrlFor({ shareUrl, meetingId }) {
  return shareUrl || (meetingId ? `${SHARE_BASE_URL}/m/${meetingId}` : "");
}

/**
 * Copy and share, with the "Copied" state that has to live somewhere.
 *
 * A hook rather than a component so a list row and a full card can behave
 * identically while looking nothing alike.
 */
export function useMeetingShare({ shareUrl, meetingId, title }) {
  const url = shareUrlFor({ shareUrl, meetingId });
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (!url) return;
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      // A clipboard that refuses is not worth an alert: the URL is on screen
      // and selectable, so there is still a way to get it.
    }
  }, [url]);

  const share = useCallback(async () => {
    if (!url) return;
    try {
      // The URL goes in the message as well as in `url`: Android ignores the
      // url field, and a share with nothing in the body arrives as an empty
      // message on plenty of services.
      await Share.share({ message: title ? `${title}\n${url}` : url, url, title });
    } catch (e) {
      // Dismissing the sheet throws on iOS. Not an error.
    }
  }, [url, title]);

  return { url, copied, copy, share };
}

/**
 * The full treatment: the link itself, then copy and send.
 *
 * The URL is shown rather than hidden behind a button because an organiser
 * about to post it somewhere wants to see what they are posting — and because
 * a link you cannot read is one you cannot check is the right meeting.
 */
export function ShareLinkCard({ shareUrl, meetingId, title, note, style }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { url, copied, copy, share } = useMeetingShare({ shareUrl, meetingId, title });

  if (!url) return null;

  return (
    <View style={[styles.card, style]}>
      <Text style={styles.label}>{t("share.yourLink")}</Text>
      <Text style={styles.url} selectable numberOfLines={2}>{url}</Text>

      <View style={styles.row}>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={share}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>{t("created.shareVia")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          onPress={copy}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>
            {copied ? t("created.copied") : t("created.copyLink")}
          </Text>
        </Pressable>
      </View>

      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

/**
 * A row's worth: one tap, straight to the share sheet.
 *
 * No copy here on purpose — a list is somewhere you decide which meeting, not
 * somewhere you read a URL, and two buttons per row would make the figures
 * beside them harder to scan than the actions.
 */
export function ShareButton({ shareUrl, meetingId, title, style }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { url, share } = useMeetingShare({ shareUrl, meetingId, title });

  if (!url) return null;

  return (
    <Pressable
      style={({ pressed }) => [styles.chip, pressed && styles.pressed, style]}
      onPress={share}
      accessibilityRole="button"
      accessibilityLabel={t("share.button")}
      // Bigger than it looks: it sits among figures, and a miss opens the
      // meeting instead of the share sheet.
      hitSlop={10}
    >
      <Text style={styles.chipText}>{`↗  ${t("share.button")}`}</Text>
    </Pressable>
  );
}

const makeStyles = (t) => StyleSheet.create({
  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: t.border,
  },
  label: {
    fontFamily: FONTS.accentMedium,
    fontSize: t.fs(11),
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: t.text3,
  },
  url: {
    fontFamily: FONTS.bodyMedium,
    fontSize: t.fs(13.5),
    color: t.accent,
    marginTop: 8,
    lineHeight: t.fs(19),
  },
  row: { flexDirection: "row", gap: 10, marginTop: 14 },
  primary: {
    flex: 1, height: 44, borderRadius: RADIUS.base,
    backgroundColor: t.accent, alignItems: "center", justifyContent: "center",
  },
  primaryText: { fontFamily: FONTS.accent, fontSize: t.fs(14), color: t.accentOn },
  secondary: {
    flex: 1, height: 44, borderRadius: RADIUS.base,
    backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border,
    alignItems: "center", justifyContent: "center",
  },
  secondaryText: { fontFamily: FONTS.accent, fontSize: t.fs(14), color: t.text },
  note: { fontSize: t.fs(12.5), color: t.text2, marginTop: 12, lineHeight: t.fs(18) },
  pressed: { opacity: 0.75 },

  chip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: RADIUS.pill,
    backgroundColor: t.accentSoft,
  },
  chipText: { fontFamily: FONTS.accent, fontSize: t.fs(12.5), color: t.accent },
});
