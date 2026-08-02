import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../api";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";
import { RADIUS, SHADOW } from "../styles/theme";

function when(iso) {
  const time = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

export default function InboxScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

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
  return <View style={styles.page}>
    <View style={styles.header}>
      <View><Text style={styles.title}>Inbox</Text><Text style={styles.sub}>{unread ? `${unread} unread update${unread === 1 ? "" : "s"}` : "Messages from Metz"}</Text></View>
      {unread ? <Pressable onPress={readAll} style={styles.readAll} disabled={markingAll}><Text style={styles.readAllText}>{markingAll ? "?" : "Read all"}</Text></Pressable> : null}
    </View>
    <FlatList data={messages} keyExtractor={(m) => String(m.id)} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[theme.accent]} />}
      contentContainerStyle={messages.length ? styles.list : styles.emptyList}
      renderItem={({ item }) => {
        const kind = KINDS[item.kind] || KINDS.system;
        return <Pressable onPress={() => read(item)} style={[styles.card, !item.read_at && styles.unread]}><View style={[styles.icon, kind.tint && styles[kind.tint]]}><Text style={styles.iconText}>{kind.icon}</Text></View><View style={styles.body}><View style={styles.line}><Text style={styles.cardTitle}>{item.title}</Text>{!item.read_at ? <View style={styles.dot} /> : null}</View><Text style={styles.message}>{item.body}</Text><Text style={styles.time}>{when(item.created_at)}</Text></View></Pressable>;
      }}
      ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Your inbox is clear</Text><Text style={styles.emptyText}>Report decisions and important updates from Metz will show up here.</Text></View>} />
  </View>;
}
const makeStyles = (t) => StyleSheet.create({
  page:{flex:1,backgroundColor:t.bg,padding:18},center:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:t.bg},header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:18},title:{fontFamily:FONTS.heading,fontSize:27,color:t.text},sub:{color:t.text2,marginTop:2,fontSize:13},readAll:{paddingHorizontal:12,paddingVertical:8,borderRadius:RADIUS.pill,backgroundColor:t.accentSoft},readAllText:{color:t.accentStrong,fontFamily:FONTS.headingSemi,fontSize:12},list:{paddingBottom:28},card:{flexDirection:"row",gap:12,padding:14,marginBottom:10,borderRadius:16,backgroundColor:t.surface,borderWidth:1,borderColor:t.border,...SHADOW.s1},unread:{borderColor:t.accent,backgroundColor:t.accentSoft},icon:{width:34,height:34,borderRadius:17,alignItems:"center",justifyContent:"center",backgroundColor:t.surface2},moderation:{backgroundColor:"rgba(231,76,60,0.13)"},welcome:{backgroundColor:"rgba(102,126,234,0.15)"},update:{backgroundColor:"rgba(123,95,214,0.15)"},status:{backgroundColor:"rgba(224,140,26,0.16)"},activity:{backgroundColor:"rgba(13,156,138,0.15)"},reminder:{backgroundColor:"rgba(245,87,108,0.14)"},iconText:{fontSize:15},body:{flex:1},line:{flexDirection:"row",alignItems:"center",gap:8},cardTitle:{flex:1,fontFamily:FONTS.headingSemi,color:t.text,fontSize:14},dot:{width:7,height:7,borderRadius:4,backgroundColor:t.accent},message:{color:t.text2,fontSize:13,lineHeight:19,marginTop:5},time:{color:t.text3,fontSize:11,marginTop:8},emptyList:{flexGrow:1,justifyContent:"center"},empty:{alignItems:"center",paddingHorizontal:30},emptyTitle:{fontFamily:FONTS.heading,fontSize:18,color:t.text},emptyText:{color:t.text2,textAlign:"center",lineHeight:20,marginTop:7}
});
