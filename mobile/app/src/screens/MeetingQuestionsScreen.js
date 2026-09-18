import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { api } from "../api";
import { Alert } from "../components/AppAlert";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";
import FaceAvatar from "../components/FaceAvatar";
import TrustBadge from "../components/TrustBadge";
import { formatAgo } from "../utils/time";

/**
 * The discussion on one meeting, for the organiser running it.
 *
 * The full app shows this inside the meeting page, under the people and above
 * the join button, because there it is context for someone deciding whether to
 * come. Metz Host has the opposite reader: the person who posted it, for whom
 * an unanswered question is a job rather than a detail — so it gets its own
 * screen, reached from the questions count on the insights page.
 *
 * Pulling MeetingDetail into Host instead would have been less code and the
 * wrong app: it carries the map, the attendee list, joining, leaving and
 * reporting, none of which the light app has any business doing.
 *
 * Same three endpoints as the full app, so a reply sent here is the same reply,
 * and the server still decides who may delete what — `can_delete` is drawn
 * rather than worked out, so client and server cannot disagree.
 */
export default function MeetingQuestionsScreen({ route, navigation }) {
  const meetingId = route?.params?.meetingId;
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => {
    api.getComments(meetingId)
      .then((list) => setComments(Array.isArray(list) ? list : []))
      .catch(() => setComments([]))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [meetingId]);

  // Refetched on focus rather than once: somebody may have asked something
  // while this screen sat in the back stack.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handlePost = useCallback(async () => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const created = await api.addComment(meetingId, text);
      setDraft("");
      setComments((prev) => [...prev, created]);
    } catch (e) {
      Alert.alert(t("common.somethingWentWrong"), e.message || "");
    } finally {
      setPosting(false);
    }
  }, [draft, posting, meetingId, t]);

  const handleDelete = useCallback((comment) => {
    Alert.alert(t("detail.deleteComment"), t("detail.cannotUndo"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          // Removed first so the list answers the tap, put back if the server
          // refuses — the same bargain the full app makes.
          const before = comments;
          setComments((prev) => prev.filter((c) => c.id !== comment.id));
          try {
            await api.deleteComment(meetingId, comment.id);
          } catch (e) {
            setComments(before);
          }
        },
      },
    ]);
  }, [comments, meetingId, t]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listInner}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={theme.accent}
          />
        }
      >
        {comments.length ? (
          comments.map((comment) => (
            <View key={comment.id} style={styles.comment}>
              {/* Not a link to a profile: Host has no screen to open one on,
                  and a tap that goes nowhere is worse than a picture. */}
              <View style={[
                styles.avatar,
                !comment.avatar_face && { backgroundColor: comment.color },
              ]}>
                {comment.avatar_face
                  ? <FaceAvatar id={comment.avatar_face} size={30} />
                  : <Text style={styles.initial}>{comment.initial}</Text>}
              </View>

              <View style={{ flex: 1 }}>
                <View style={styles.head}>
                  <Text style={styles.name} numberOfLines={1}>{comment.username}</Text>
                  {comment.is_host ? <Text style={styles.hostTag}>{t("detail.host")}</Text> : null}
                  {comment.is_trusted || comment.is_admin ? <TrustBadge /> : null}
                  <Text style={styles.age}>{formatAgo(comment.created_at)}</Text>
                </View>
                <Text style={styles.text}>{comment.text}</Text>
                {comment.can_delete ? (
                  <TouchableOpacity onPress={() => handleDelete(comment)}>
                    <Text style={styles.delete}>{t("common.delete")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>{t("detail.noMessages")}</Text>
        )}
      </ScrollView>

      {/* Pinned rather than following the list: on a long thread the reply box
          is what the organiser opened this screen to reach. */}
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("detail.composerPlaceholder")}
          placeholderTextColor={theme.text3}
          multiline
          // MAX_COMMENT_LEN on the server. The server still decides; this only
          // spares a round trip to be told.
          maxLength={300}
        />
        <TouchableOpacity
          style={[styles.send, (!draft.trim() || posting) && styles.sendOff]}
          onPress={handlePost}
          disabled={!draft.trim() || posting}
        >
          {posting
            ? <ActivityIndicator color={theme.accentOn} size="small" />
            : <Text style={styles.sendText}>{t("detail.send")}</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (t) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
  list: { flex: 1 },
  listInner: { padding: 16, paddingBottom: 8 },

  comment: { flexDirection: "row", gap: 10, marginBottom: 16 },
  avatar: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  initial: { fontFamily: FONTS.accent, fontSize: t.fs(12), color: "#fff" },
  head: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  name: { fontFamily: FONTS.bodySemi, fontSize: t.fs(13.5), color: t.text, flexShrink: 1 },
  hostTag: {
    fontFamily: FONTS.accentMedium, fontSize: t.fs(10),
    color: t.accent, backgroundColor: t.accentSoft,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.pill, overflow: "hidden",
  },
  age: { fontSize: t.fs(11.5), color: t.text3 },
  text: { fontSize: t.fs(14), color: t.text, lineHeight: t.fs(20), marginTop: 3 },
  delete: { fontSize: t.fs(12), color: t.text3, marginTop: 5 },
  empty: { fontSize: t.fs(14), color: t.text2, textAlign: "center", marginTop: 28 },

  composer: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    padding: 12,
    backgroundColor: t.surface,
    borderTopWidth: 1, borderTopColor: t.border,
  },
  input: {
    flex: 1, maxHeight: 110, minHeight: 42,
    backgroundColor: t.surface2,
    borderRadius: RADIUS.base,
    paddingHorizontal: 12, paddingTop: 11, paddingBottom: 11,
    fontSize: t.fs(14), color: t.text,
  },
  send: {
    minWidth: 68, height: 42, borderRadius: RADIUS.base,
    backgroundColor: t.accent, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 14,
  },
  sendOff: { backgroundColor: t.border },
  sendText: { fontFamily: FONTS.accent, fontSize: t.fs(14), color: t.accentOn },
});
