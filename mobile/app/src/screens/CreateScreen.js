import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import AnimatedPressable from "../components/AnimatedPressable";
import { FONTS } from "../styles/fonts";

const CENTER = { latitude: 31.7683, longitude: 35.2137, latitudeDelta: 0.4, longitudeDelta: 0.4 };
const EMOJIS = ["📍", "🎉", "☕", "🍕", "🎮", "🎵", "📚", "⚽", "🧘", "🎨", "💻", "🌐", "🎬", "🚴", "🏕️", "🍻"];

export default function CreateScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("inperson");
  const [time, setTime] = useState("");
  const [locationName, setLocationName] = useState("");
  const [pin, setPin] = useState(null);
  const [link, setLink] = useState("");
  const [emoji, setEmoji] = useState("📍");
  const [tags, setTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getTags().then(setAllTags).catch(() => {});
  }, []);

  function toggleTag(tag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function handleSubmit() {
    setError("");
    try {
      const payload = {
        title, description, time, type, emoji, tags,
        location_name: locationName,
        lat: pin ? pin.latitude : null,
        lng: pin ? pin.longitude : null,
        link,
      };
      const res = await api.createMeeting(payload);
      Alert.alert(
        res.status === "pending" ? "Submitted for review" : "Meeting created!",
        res.status === "pending"
          ? "Your meeting will appear once an admin approves it."
          : "Your meeting is live."
      );
      navigation.navigate("Home");
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.header}>Create a New Meeting</Text>
      <Text style={styles.subheader}>Fill in the details and share it with the community</Text>

      {error ? <Text style={styles.error}>⚠ {error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={100} placeholder="Give it a catchy name" placeholderTextColor="#9aa3ad" />

        <Text style={styles.label}>Description</Text>
        <TextInput style={[styles.input, { height: 80 }]} value={description} onChangeText={setDescription} multiline maxLength={500} placeholder="What's this meeting about?" placeholderTextColor="#9aa3ad" />

        <Text style={styles.label}>Type</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.toggleBtn, type === "inperson" && styles.toggleBtnActive]} onPress={() => setType("inperson")}>
            <Text style={[styles.toggleText, type === "inperson" && styles.toggleTextActive]}>📍 In-Person</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.toggleBtn, type === "online" && styles.toggleBtnActive]} onPress={() => setType("online")}>
            <Text style={[styles.toggleText, type === "online" && styles.toggleTextActive]}>🌐 Online</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Interests</Text>
        <View style={styles.tagWrap}>
          {allTags.map((t) => (
            <TouchableOpacity key={t} style={[styles.tagBtn, tags.includes(t) && styles.tagBtnActive]} onPress={() => toggleTag(t)}>
              <Text style={[styles.tagBtnText, tags.includes(t) && styles.tagBtnTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Map Icon</Text>
        <View style={styles.tagWrap}>
          {EMOJIS.map((e) => (
            <TouchableOpacity key={e} style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]} onPress={() => setEmoji(e)}>
              <Text style={{ fontSize: 18 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        {type === "inperson" ? (
          <>
            <Text style={styles.label}>Location name</Text>
            <TextInput style={styles.input} value={locationName} onChangeText={setLocationName} placeholder="e.g. Tel Aviv Park" placeholderTextColor="#9aa3ad" />
            <Text style={styles.hint}>Tap the map to drop a pin</Text>
            <MapView
              style={styles.map}
              initialRegion={CENTER}
              onPress={(e) => setPin(e.nativeEvent.coordinate)}
            >
              {pin ? <Marker coordinate={pin} /> : null}
            </MapView>
          </>
        ) : (
          <>
            <Text style={styles.label}>Meeting link</Text>
            <TextInput style={styles.input} value={link} onChangeText={setLink} placeholder="https://zoom.us/j/..." placeholderTextColor="#9aa3ad" autoCapitalize="none" />
          </>
        )}

        <Text style={styles.label}>Date & time</Text>
        <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="YYYY-MM-DD HH:MM" placeholderTextColor="#9aa3ad" />
      </View>

      <AnimatedPressable style={styles.submitBtn} onPress={handleSubmit}>
        <Text style={styles.submitText}>Create Meeting</Text>
      </AnimatedPressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f0f2f5" },
  header: { fontSize: 22, fontFamily: FONTS.heading, color: "#2c3e50" },
  subheader: { fontSize: 13, color: "#888", marginBottom: 16 },
  card: {
    backgroundColor: "#fff", borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  label: { fontSize: 13, fontWeight: "700", color: "#555", marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: "#dce1e7", borderRadius: 10, padding: 11, fontSize: 14, backgroundColor: "#fafbfc" },
  row: { flexDirection: "row", gap: 10 },
  toggleBtn: { flex: 1, borderWidth: 1.5, borderColor: "#dce1e7", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  toggleBtnActive: { backgroundColor: "#667eea", borderColor: "transparent" },
  toggleText: { fontWeight: "700", color: "#888" },
  toggleTextActive: { color: "#fff" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagBtn: { borderWidth: 1.5, borderColor: "#dce1e7", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  tagBtnActive: { backgroundColor: "#667eea", borderColor: "transparent" },
  tagBtnText: { fontSize: 12, fontWeight: "600", color: "#666" },
  tagBtnTextActive: { color: "#fff" },
  emojiBtn: { width: 40, height: 40, borderWidth: 1.5, borderColor: "#dce1e7", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emojiBtnActive: { backgroundColor: "#667eea", borderColor: "transparent" },
  hint: { fontSize: 12, color: "#999", marginBottom: 6 },
  map: { height: 220, borderRadius: 12, marginBottom: 4 },
  submitBtn: {
    backgroundColor: "#667eea", borderRadius: 24, paddingVertical: 15, alignItems: "center", marginTop: 6, marginBottom: 40,
    shadowColor: "#667eea", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  submitText: { color: "#fff", fontFamily: FONTS.accent, fontSize: 16, letterSpacing: 0.3 },
  error: {
    color: "#c0392b", backgroundColor: "#fdecea", borderColor: "#f5c6cb", borderWidth: 1,
    borderLeftColor: "#e74c3c", borderLeftWidth: 4, borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13.5, fontWeight: "600",
  },
});
