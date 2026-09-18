import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS, SHADOW } from "../styles/theme";
import Appear from "../components/Appear";
import { useMeetingShare } from "../components/ShareLink";

const STEPS = ["share", "track", "next"];

/**
 * What to do with the meeting you have just made.
 *
 * Creating one used to end in an alert and a bounce back to Home, which is the
 * moment an organiser has the most to do and the least idea what. Three things
 * are worth knowing and none of them are discoverable: the link works for
 * people who have never heard of this app, there is a screen showing whether
 * sharing did anything, and a new organiser's meeting is not on the map yet.
 *
 * Steps rather than one page because they are sequential in time — send it now,
 * check it later, and here is where it lives in between — and a single screen
 * listing all three reads as documentation rather than as something to act on.
 *
 * Reached by replace(), not navigate(): going back to a create form that has
 * already been submitted would offer to submit it again.
 */
export default function MeetingCreatedScreen({ route, navigation }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const { meetingId, status, shareUrl, title } = route.params || {};
  // A meeting waiting on review is not on the map, and its link 404s until an
  // admin approves it. Every step has to say something different because of
  // that, so it is read once here.
  const pending = status === "pending";

  const [step, setStep] = useState(0);

  // Copy and share were written out here, and again wherever else the link
  // appeared. One implementation now, in components/ShareLink — the title
  // travels with the link because a bare URL in a group chat says nothing
  // until somebody taps it.
  const { url, copied, copy: handleCopy, share: handleShare } =
    useMeetingShare({ shareUrl, meetingId, title });

  const finish = useCallback(() => navigation.navigate("Home"), [navigation]);

  const last = step === STEPS.length - 1;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {STEPS[step] === "share" ? (
          <Appear key="share" offset={8}>
            <Text style={styles.kicker}>{t("created.kicker")}</Text>
            <Text style={styles.heading}>{t("created.shareHeading")}</Text>
            <Text style={styles.body}>{t("created.shareBody")}</Text>

            <View style={styles.linkBox}>
              {/* The whole link, not an ellipsis: people check a URL before
                  they paste it somewhere public. */}
              <Text style={styles.linkText} selectable>{url}</Text>
            </View>

            <Pressable style={styles.primary} onPress={handleCopy}>
              <Text style={styles.primaryText}>
                {copied ? t("created.copied") : t("created.copyLink")}
              </Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={handleShare}>
              <Text style={styles.secondaryText}>{t("created.shareVia")}</Text>
            </Pressable>

            {pending ? (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{t("created.linkPending")}</Text>
              </View>
            ) : null}
          </Appear>
        ) : null}

        {STEPS[step] === "track" ? (
          <Appear key="track" offset={8}>
            <Text style={styles.kicker}>{t("created.kicker2")}</Text>
            <Text style={styles.heading}>{t("created.trackHeading")}</Text>
            <Text style={styles.body}>{t("created.trackBody")}</Text>

            {/* A still of the real screen rather than a description of it —
                the figures are what makes it worth opening, and naming them
                here is what makes the screen findable later. */}
            <View style={styles.preview}>
              <PreviewRow styles={styles} value="12" label={t("insights.opened")} />
              <PreviewRow styles={styles} value="4" label={t("insights.going")} accent />
              <View style={styles.previewRule} />
              <Text style={styles.previewNote}>{t("created.trackNote")}</Text>
            </View>

            <Pressable
              style={styles.secondary}
              onPress={() => navigation.navigate("MeetingInsights", { meetingId })}
            >
              <Text style={styles.secondaryText}>{t("created.openInsights")}</Text>
            </Pressable>
          </Appear>
        ) : null}

        {STEPS[step] === "next" ? (
          <Appear key="next" offset={8}>
            <Text style={styles.kicker}>{t("created.kicker3")}</Text>
            <Text style={styles.heading}>{t("created.nextHeading")}</Text>

            {/* "Where did my meeting go" is the question a new organiser
                actually asks, because a pending meeting is hidden from every
                public listing by design. Answering it before it is asked is
                the whole point of this step. */}
            <Point styles={styles} icon="🕒" text={t(pending ? "created.nextReview" : "created.nextLive")} />
            <Point styles={styles} icon="📋" text={t("created.nextWhere")} />
            <Point styles={styles} icon="💬" text={t("created.nextQuestions")} />
          </Appear>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.dots}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, i === step && styles.dotOn]} />
          ))}
        </View>
        <View style={styles.actions}>
          {/* On the last step Done becomes the button rather than staying the
              quiet link Skip was: leaving the only remaining action styled as
              an aside makes the flow look like it has no ending. */}
          {last ? (
            <Pressable style={styles.next} onPress={finish}>
              <Text style={styles.nextText}>{t("created.done")}</Text>
            </Pressable>
          ) : (
            <>
              {/* Always available and always finishes — someone who knows all
                  this should reach Home now, not be walked through the rest. */}
              <Pressable onPress={finish} style={styles.skip}>
                <Text style={styles.skipText}>{t("created.skip")}</Text>
              </Pressable>
              <Pressable style={styles.next} onPress={() => setStep(step + 1)}>
                <Text style={styles.nextText}>{t("created.next")}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function PreviewRow({ styles, value, label, accent }) {
  return (
    <View style={styles.previewRow}>
      <Text style={[styles.previewValue, accent && styles.previewValueOn]}>{value}</Text>
      <Text style={styles.previewLabel}>{label}</Text>
    </View>
  );
}

function Point({ styles, icon, text }) {
  return (
    <View style={styles.point}>
      <Text style={styles.pointIcon}>{icon}</Text>
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },

  kicker: {
    fontSize: t.fs(11), fontFamily: FONTS.bodySemi, color: t.accent,
    textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8,
  },
  heading: { fontSize: t.fs(24), fontFamily: FONTS.heading, color: t.text, lineHeight: t.fs(31) },
  body: { fontSize: t.fs(15), color: t.text2, lineHeight: 23, marginTop: 12 },

  linkBox: {
    backgroundColor: t.surface2, borderRadius: RADIUS.base, borderWidth: 1,
    borderColor: t.border, padding: 14, marginTop: 20,
  },
  linkText: { fontSize: t.fs(13.5), color: t.text, fontFamily: FONTS.accentMedium },

  primary: {
    backgroundColor: t.accent, borderRadius: RADIUS.pill, paddingVertical: 15,
    alignItems: "center", marginTop: 14, ...SHADOW.s2,
  },
  primaryText: { color: t.accentOn, fontFamily: FONTS.accent, fontSize: t.fs(15.5) },
  secondary: {
    borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: "center",
    marginTop: 10, borderWidth: 1.5, borderColor: t.border, backgroundColor: t.surface,
  },
  secondaryText: { color: t.text, fontFamily: FONTS.accentMedium, fontSize: t.fs(14.5) },

  notice: {
    backgroundColor: t.status.warnSoft, borderRadius: RADIUS.base,
    padding: 13, marginTop: 18,
  },
  noticeText: { fontSize: t.fs(13), color: t.status.warn, fontFamily: FONTS.bodySemi, lineHeight: 19 },

  preview: {
    backgroundColor: t.surface, borderRadius: RADIUS.lg, borderWidth: 1,
    borderColor: t.border, padding: 16, marginTop: 20, ...SHADOW.s1,
  },
  previewRow: { flexDirection: "row", alignItems: "baseline", gap: 12, paddingVertical: 5 },
  previewValue: { fontFamily: FONTS.accent, fontSize: t.fs(26), color: t.text, minWidth: 42 },
  previewValueOn: { color: t.accent },
  previewLabel: {
    fontSize: t.fs(11), fontFamily: FONTS.bodySemi, color: t.text3, textTransform: "uppercase",
  },
  previewRule: { height: 1, backgroundColor: t.border, marginVertical: 12 },
  previewNote: { fontSize: t.fs(13), color: t.text3, lineHeight: 19 },

  point: { flexDirection: "row", gap: 12, marginTop: 18, alignItems: "flex-start" },
  pointIcon: { fontSize: t.fs(19), lineHeight: t.fs(25) },
  pointText: { flex: 1, fontSize: t.fs(14.5), color: t.text2, lineHeight: 22 },

  footer: {
    paddingHorizontal: 20, paddingTop: 12, gap: 12,
    borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.border },
  dotOn: { backgroundColor: t.accent, width: 18 },
  actions: { flexDirection: "row", alignItems: "center", gap: 12 },
  skip: { paddingVertical: 12, paddingHorizontal: 10 },
  skipText: { color: t.text3, fontFamily: FONTS.bodySemi, fontSize: t.fs(14) },
  next: {
    flex: 1, backgroundColor: t.accent, borderRadius: RADIUS.pill,
    paddingVertical: 14, alignItems: "center",
  },
  nextText: { color: t.accentOn, fontFamily: FONTS.accent, fontSize: t.fs(15) },
});
