import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import { api } from "../api";

const CENTER = { latitude: 31.7683, longitude: 35.2137, latitudeDelta: 0.4, longitudeDelta: 0.4 };
const EMOJIS = ["📍", "🎉", "☕", "🍕", "🎮", "🎵", "📚", "⚽", "🧘", "🎨", "💻", "🌐", "🎬", "🚴", "🏕️", "🍻"];

export default function CreateScreen({ navigation }) {
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.header}>Create a New Meeting</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={100} />

      <Text style={styles.label}>Description</Text>
      <TextInput style={[styles.input, { height: 80 }]} value={description} onChangeText={setDescription} multiline maxLength={500} />

      <Text style={styles.label}>Type</Text>
      <View style={styles.row}>
        <TouchableOpacity style={[styles.toggleBtn, type === "inperson" && styles.toggleBtnActive]} onPress={() => setType("inperson")}>
          <Text style={[styles.toggleText, type === "inperson" && styles.toggleTextActive]}>In-Person</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, type === "online" && styles.toggleBtnActive]} onPress={() => setType("online")}>
          <Text style={[styles.toggleText, type === "online" && styles.toggleTextActive]}>Online</Text>
        </TouchableOpacity>
      </View>

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

      {type === "inperson" ? (
        <>
          <Text style={styles.label}>Location name</Text>
          <TextInput style={styles.input} value={locationName} onChangeText={setLocationName} placeholder="e.g. Tel Aviv Park" />
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
          <TextInput style={styles.input} value={link} onChangeText={setLink} placeholder="https://zoom.us/j/..." autoCapitalize="none" />
        </>
      )}

      <Text style={styles.label}>Date & time</Text>
      <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="YYYY-MM-DD HH:MM" />

      <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
        <Text style={styles.submitText}>Create Meeting</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { fontSize: 20, fontWeight: "800", color: "#2c3e50", marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "700", color: "#555", marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: "#dce1e7", borderRadius: 8, padding: 10, fontSize: 14 },
  row: { flexDirection: "row", gap: 10 },
  toggleBtn: { flex: 1, borderWidth: 1.5, borderColor: "#dce1e7", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  toggleBtnActive: { backgroundColor: "#667eea", borderColor: "transparent" },
  toggleText: { fontWeight: "700", color: "#888" },
  toggleTextActive: { color: "#fff" },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagBtn: { borderWidth: 1.5, borderColor: "#dce1e7", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  tagBtnActive: { backgroundColor: "#667eea", borderColor: "transparent" },
  tagBtnText: { fontSize: 12, fontWeight: "600", color: "#666" },
  tagBtnTextActive: { color: "#fff" },
  emojiBtn: { width: 40, height: 40, borderWidth: 1.5, borderColor: "#dce1e7", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  emojiBtnActive: { backgroundColor: "#667eea", borderColor: "transparent" },
  hint: { fontSize: 12, color: "#999", marginBottom: 6 },
  map: { height: 220, borderRadius: 12 },
  submitBtn: { backgroundColor: "#2ecc71", borderRadius: 24, paddingVertical: 14, alignItems: "center", marginTop: 24, marginBottom: 40 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  error: { color: "#e74c3c", fontWeight: "600", marginBottom: 10 },
});
