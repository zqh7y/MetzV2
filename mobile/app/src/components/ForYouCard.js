import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import TrustBadge from "./TrustBadge";
import { FONTS } from "../styles/fonts";

// Same five-colour rotation the web shelf uses, so a meeting looks the
// same on both clients.
const GRADIENTS = [
  ["#667eea", "#764ba2"],
  ["#f093fb", "#f5576c"],
  ["#4facfe", "#00f2fe"],
  ["#43e97b", "#38f9d7"],
  ["#fa709a", "#fee140"],
];

export default function ForYouCard({ meeting, index, onPress, onJoin, onPass }) {
  const isOnline = meeting.type === "OnlineMeeting";
  const colors = GRADIENTS[index % GRADIENTS.length];

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <Text style={styles.badge}>{isOnline ? "🌐 Online" : "📍 In-Person"}</Text>
        <Text style={styles.title} numberOfLines={2}>{meeting.title}</Text>
        <Text style={styles.time}>{meeting.time}</Text>
        {isOnline ? (
          <Text style={styles.place}>🔗 Online</Text>
        ) : meeting.short_location ? (
          <Text style={styles.place} numberOfLines={1}>📍 {meeting.short_location}</Text>
        ) : null}
        <Text style={styles.desc} numberOfLines={2}>{meeting.description}</Text>

        {meeting.creator_username ? (
          <View style={styles.creatorRow}>
            <Text style={styles.creator} numberOfLines={1}>👤 {meeting.creator_username}</Text>
            {meeting.creator_is_trusted ? <TrustBadge /> : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.passBtn]} onPress={onPass}>
            <Text style={styles.passText}>✕  Pass</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.joinBtn]} onPress={onJoin}>
            <Text style={styles.joinText}>✓  Join</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 216,
    borderRadius: 18,
    padding: 13,
    marginRight: 12,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.24)",
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 3,
    overflow: "hidden",
  },
  title: { color: "#fff", fontFamily: FONTS.heading, fontSize: 15, marginTop: 8 },
  time: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600", marginTop: 2 },
  place: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600", marginTop: 2 },
  desc: { color: "rgba(255,255,255,0.92)", fontSize: 12, marginTop: 7, minHeight: 32 },
  creatorRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  creator: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontWeight: "600", flexShrink: 1 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: "center" },
  passBtn: { backgroundColor: "rgba(255,255,255,0.22)" },
  joinBtn: { backgroundColor: "#fff" },
  passText: { color: "#fff", fontSize: 12, fontFamily: FONTS.accent },
  joinText: { color: "#2c3e50", fontSize: 12, fontFamily: FONTS.accent },
});
