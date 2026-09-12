import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { RADIUS, SHADOW } from "../styles/theme";
import { useI18n } from "../context/LocaleContext";
import { getActiveLanguage, t } from "../i18n/active";
import ActivityPane from "./ActivityScreen";

function when(iso) {
  const time = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return t("time.justNowCap");
  if (seconds < 3600) return t("time.minutesAgoShort", { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t("time.hoursAgo", { count: Math.floor(seconds / 3600) });
  if (seconds < 604800) return t("time.daysAgoShort", { count: Math.floor(seconds / 86400) });
  return new Date(iso).toLocaleDateString(getActiveLanguage(), { month: "short", day: "numeric" });
}

// Icon and tint per message kind. Anything the server sends that is not listed
// here falls back to the plain system row, so the API can add a kind without
// this app needing to ship first.
const KINDS = {
  system:     { icon: "✉️", tint: null },
  moderation: { icon: "⚑",  tint: "moderation" },
  welcome:    { icon: "👋", tint: "welcome" },
  update:     { icon: "✨", tint: "update" },
  status:     { icon: "🏅", tint: "status" },
  activity:   { icon: "📍", tint: "activity" },
  reminder:   { icon: "⏰", tint: "reminder" },
};

/**
 * Inbox — everything Metz has to say to you, in two tabs.
 *
 * Activity used to be its own destination in the drawer, which put two
 * "things are waiting for you" counters one above the other in the same menu
 * and left you to guess which one the red dot belonged to. They are the same
 * question asked twice — what needs me — so they are now one screen: the
 * things you must *answer* on the left, the things Metz has *told* you on the
 * right.
 *
 * The panes stay separate components rather than one merged list. Activity is
 * derived state that expires (see ActivityScreen) while inbox rows are stored
 * messages you mark read, so interleaving them would mean inventing an order
 * between a thing that is true right now and a thing that happened at 4pm.
 */
export default function InboxScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t } = useI18n();
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  // The drawer badge adds the two counts together, so a tap on "3" has to land
  // somewhere that actually shows three things — opening on the empty tab
  // would read as the badge lying. Decided once, from a ref, so the tab never
  // changes underneath someone who is mid-read when the counts refresh.
  const actionCount = profile?.action_count || 0;
  const initialTab = useRef(actionCount > 0 ? "activity" : "messages");
  const [tab, setTab] = useState(initialTab.current);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    try { setMessages((await api.getInbox()).messages || []); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const read = async (item) => {
    if (item.read_at) return;
    setMessages((rows) => rows.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
    try { await api.readInboxMessage(item.id); } catch { load(true); }
  };
  const readAll = async () => {
    setMarkingAll(true);
    try {
      await api.readAllInbox();
      setMessages((rows) => rows.map((row) => ({ ...row, read_at: row.read_at || new Date().toISOString() })));
    } finally { setMarkingAll(false); }
  };
  const unread = messages.filter((m) => !m.read_at).length;

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={theme.accent} /></View>;

  const onMessages = tab === "messages";

  return <View style={styles.page}>
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{t("nav.inbox")}</Text>
        <Text style={styles.sub}>{unread ? t("inbox.unread", { count: unread }) : t("inbox.subtitle")}</Text>
      </View>
      {/* Only ever applies to the message list, so it goes with that tab. */}
      {onMessages && unread ? <Pressable onPress={readAll} style={styles.readAll} disabled={markingAll}><Text style={styles.readAllText}>{markingAll ? "…" : t("inbox.readAll")}</Text></Pressable> : null}
    </View>

    {/* Counts sit on the tabs rather than only in the drawer, so the split is
        worth making: you can see which side is asking for you before tapping. */}
    <View style={styles.tabs}>
      <Pressable style={[styles.tab, !onMessages && styles.tabOn]} onPress={() => setTab("activity")}>
        <Text style={[styles.tabText, !onMessages && styles.tabTextOn]} numberOfLines={1}>{t("nav.activity")}</Text>
        {actionCount ? <View style={styles.tabCount}><Text style={styles.tabCountText}>{actionCount > 99 ? "99+" : actionCount}</Text></View> : null}
      </Pressable>
      <Pressable style={[styles.tab, onMessages && styles.tabOn]} onPress={() => setTab("messages")}>
        <Text style={[styles.tabText, onMessages && styles.tabTextOn]} numberOfLines={1}>{t("inbox.tabMessages")}</Text>
        {unread ? <View style={styles.tabCount}><Text style={styles.tabCountText}>{unread > 99 ? "99+" : unread}</Text></View> : null}
      </Pressable>
    </View>

    {/* Mounted only while selected. Activity refetches on a timer and on
        focus, and a hidden pane doing that would be polling the API for a
        screen nobody is looking at. */}
    {onMessages ? (
      <FlatList data={messages} keyExtractor={(m) => String(m.id)} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[theme.accent]} />}
        contentContainerStyle={messages.length ? styles.list : styles.emptyList}
        renderItem={({ item }) => {
          const kind = KINDS[item.kind] || KINDS.system;
          return <Pressable onPress={() => read(item)} style={[styles.card, !item.read_at && styles.unread]}><View style={[styles.icon, kind.tint && styles[kind.tint]]}><Text style={styles.iconText}>{kind.icon}</Text></View><View style={styles.body}><View style={styles.line}><Text style={styles.cardTitle}>{item.title}</Text>{!item.read_at ? <View style={styles.dot} /> : null}</View><Text style={styles.message}>{item.body}</Text><Text style={styles.time}>{when(item.created_at)}</Text></View></Pressable>;
        }}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{t("inbox.emptyTitle")}</Text><Text style={styles.emptyText}>{t("inbox.emptyBody")}</Text></View>} />
    ) : (
      <ActivityPane navigation={navigation} />
    )}
  </View>;
}
const makeStyles = (t) => StyleSheet.create({
  // No padding on the page itself: the Activity pane brings its own gutter, so
  // padding here would indent it twice. The header and the message list each
  // set their own instead.
  page:{flex:1,backgroundColor:t.bg},center:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:t.bg},header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingHorizontal:18,paddingTop:18,marginBottom:14},title:{fontFamily:FONTS.heading,fontSize:27,color:t.text},sub:{color:t.text2,marginTop:2,fontSize:13},readAll:{paddingHorizontal:12,paddingVertical:8,borderRadius:RADIUS.pill,backgroundColor:t.accentSoft},readAllText:{color:t.accentStrong,fontFamily:FONTS.headingSemi,fontSize:12},
  tabs:{flexDirection:"row",gap:6,marginHorizontal:18,marginBottom:14,padding:4,borderRadius:RADIUS.pill,backgroundColor:t.surface2},
  tab:{flex:1,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:7,paddingVertical:9,borderRadius:RADIUS.pill},
  tabOn:{backgroundColor:t.surface,...SHADOW.s1},
  tabText:{fontSize:13.5,fontFamily:FONTS.bodySemi,color:t.text2},
  tabTextOn:{color:t.accentStrong,fontFamily:FONTS.headingSemi},
  tabCount:{minWidth:20,paddingHorizontal:6,paddingVertical:1,borderRadius:RADIUS.pill,backgroundColor:t.status.bad,alignItems:"center"},
  tabCountText:{color:"#fff",fontSize:10.5,fontFamily:FONTS.accent},
  list:{paddingHorizontal:18,paddingBottom:28},card:{flexDirection:"row",gap:12,padding:14,marginBottom:10,borderRadius:16,backgroundColor:t.surface,borderWidth:1,borderColor:t.border,...SHADOW.s1},// Unread is marked by the accent border and the dot, not by tinting the card.
// accentSoft is translucent, so filling the card with it layered over the
// surface underneath and read as a grey slab sitting inside a teal frame.
unread:{borderColor:t.accent,borderWidth:1.5},icon:{width:34,height:34,borderRadius:17,alignItems:"center",justifyContent:"center",backgroundColor:t.surface2},moderation:{backgroundColor:"rgba(231,76,60,0.13)"},welcome:{backgroundColor:"rgba(102,126,234,0.15)"},update:{backgroundColor:"rgba(123,95,214,0.15)"},status:{backgroundColor:"rgba(224,140,26,0.16)"},activity:{backgroundColor:"rgba(13,156,138,0.15)"},reminder:{backgroundColor:"rgba(245,87,108,0.14)"},iconText:{fontSize:15},body:{flex:1},line:{flexDirection:"row",alignItems:"center",gap:8},cardTitle:{flex:1,fontFamily:FONTS.headingSemi,color:t.text,fontSize:14},dot:{width:7,height:7,borderRadius:4,backgroundColor:t.accent},message:{color:t.text2,fontSize:13,lineHeight:19,marginTop:5},time:{color:t.text3,fontSize:11,marginTop:8},emptyList:{flexGrow:1,justifyContent:"center",paddingHorizontal:18},empty:{alignItems:"center",paddingHorizontal:30},emptyTitle:{fontFamily:FONTS.heading,fontSize:18,color:t.text},emptyText:{color:t.text2,textAlign:"center",lineHeight:20,marginTop:7}
});
