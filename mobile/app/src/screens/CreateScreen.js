import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert,
} from "react-native";
import { Map, Camera, Marker, MAPS_AVAILABLE } from "../components/MapShim";
import WebMap from "../components/WebMap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import AnimatedPressable from "../components/AnimatedPressable";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";

const MAP_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const CENTER = [35.2137, 31.7683]; // [lng, lat] — MapLibre order
const EMOJIS = ["📍", "🎉", "☕", "🍕", "🎮", "🎵", "📚", "⚽", "🧘", "🎨", "💻", "🌐", "🎬", "🚴", "🏕️", "🍻"];

export default function CreateScreen({ navigation }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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

  // Step 4 on the web: a meeting can require a minimum before it counts as on.
  const [needsMinimum, setNeedsMinimum] = useState(false);
  const [minAttendees, setMinAttendees] = useState(4);
  const [maxAttendees, setMaxAttendees] = useState("");
  const [joinDeadline, setJoinDeadline] = useState("");

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
        // Sent only when the organiser actually asked for a minimum, so an
        // ordinary meeting isn't silently given a threshold of 4.
        min_attendees: needsMinimum ? minAttendees : 0,
        max_attendees: needsMinimum ? maxAttendees : "",
        join_deadline: needsMinimum ? joinDeadline : "",
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
        <TextInput style={styles.input} value={title} onChangeText={setTitle} maxLength={100} placeholder="Give it a catchy name" placeholderTextColor={theme.text3} />

        <Text style={styles.label}>Description</Text>
        <TextInput style={[styles.input, { height: 80 }]} value={description} onChangeText={setDescription} multiline maxLength={500} placeholder="What's this meeting about?" placeholderTextColor={theme.text3} />

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
            <TextInput style={styles.input} value={locationName} onChangeText={setLocationName} placeholder="e.g. Tel Aviv Park" placeholderTextColor={theme.text3} />
            <Text style={styles.hint}>Tap the map to drop a pin</Text>
            {MAPS_AVAILABLE ? (
              <Map
                style={styles.map}
                mapStyle={theme.mapStyle}
                logo={false}
                attribution
                onPress={(e) => {
                  // MapLibre reports coordinates as [lng, lat]
                  const [lng, lat] = e.nativeEvent.lngLat;
                  setPin({ latitude: lat, longitude: lng });
                }}
              >
                <Camera initialViewState={{ center: CENTER, zoom: 6.5 }} />
                {pin ? <Marker lngLat={[pin.longitude, pin.latitude]} /> : null}
              </Map>
            ) : (
              <WebMap
                style={styles.map}
                theme={theme}
                center={CENTER}
                zoom={6.5}
                pin={pin ? { lat: pin.latitude, lng: pin.longitude } : null}
                onMapPress={setPin}
              />
            )}
          </>
        ) : (
          <>
            <Text style={styles.label}>Meeting link</Text>
            <TextInput style={styles.input} value={link} onChangeText={setLink} placeholder="https://zoom.us/j/..." placeholderTextColor={theme.text3} autoCapitalize="none" />
          </>
        )}

        <Text style={styles.label}>Date & time</Text>
        <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder="YYYY-MM-DD HH:MM" placeholderTextColor={theme.text3} />
      </View>

      {/* Commitment — the web's step 4 */}
      <View style={styles.card}>
        <Text style={styles.label}>Only happen if enough people join?</Text>
        <Text style={styles.hint}>
          Set a minimum and nobody has to wonder whether it's actually on. If it doesn't fill by the
          deadline, you decide what to do — it never shows up as a failed event.
        </Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.toggleBtn, !needsMinimum && styles.toggleBtnActive]}
            onPress={() => setNeedsMinimum(false)}
          >
            <Text style={[styles.toggleText, !needsMinimum && styles.toggleTextActive]}>Open to all</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, needsMinimum && styles.toggleBtnActive]}
            onPress={() => setNeedsMinimum(true)}
          >
            <Text style={[styles.toggleText, needsMinimum && styles.toggleTextActive]}>Needs a minimum</Text>
          </TouchableOpacity>
        </View>

        {needsMinimum ? (
          <>
            <Text style={styles.label}>Minimum people</Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setMinAttendees((n) => Math.max(2, n - 1))}
              >
                <Text style={styles.stepperText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{minAttendees}</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => setMinAttendees((n) => Math.min(500, n + 1))}
              >
                <Text style={styles.stepperText}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>They have to join by</Text>
            <TextInput
              style={styles.input}
              value={joinDeadline}
              onChangeText={setJoinDeadline}
              placeholder="YYYY-MM-DD HH:MM"
              placeholderTextColor={theme.text3}
            />
            <Text style={styles.hint}>Must be before the meeting starts.</Text>

            <Text style={styles.label}>Maximum (optional)</Text>
            <TextInput
              style={styles.input}
              value={maxAttendees}
              onChangeText={setMaxAttendees}
              keyboardType="number-pad"
              placeholder="No limit"
              placeholderTextColor={theme.text3}
            />
            <Text style={styles.hint}>
              Once full, extra people join a waitlist and move up automatically if someone drops out.
            </Text>
          </>
        ) : null}
      </View>

      <AnimatedPressable style={styles.submitBtn} onPress={handleSubmit}>
        <Text style={styles.submitText}>Create Meeting</Text>
      </AnimatedPressable>
    </ScrollView>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  header: { fontSize: 22, fontFamily: FONTS.heading, color: t.text },
  subheader: { fontSize: 13, color: t.text2, marginBottom: 16 },
  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
    marginBottom: 14,
    ...SHADOW.s1,
  },
  label: { fontSize: 13, fontWeight: "700", color: t.text2, marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: t.border,
    borderRadius: 10,
    padding: 11,
    fontSize: 14,
    color: t.text,
    backgroundColor: t.surface2,
  },
  row: { flexDirection: "row", gap: 10 },
  toggleBtn: { flex: 1, borderWidth: 1.5, borderColor: t.border, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  toggleBtnActive: { backgroundColor: t.accent, borderColor: "transparent" },
  toggleText: { fontWeight: "700", color: t.text2 },
  toggleTextActive: { color: t.accentOn },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagBtn: { borderWidth: 1.5, borderColor: t.border, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 7 },
  tagBtnActive: { backgroundColor: t.accent, borderColor: "transparent" },
  tagBtnText: { fontSize: 12, fontWeight: "600", color: t.text2 },
  tagBtnTextActive: { color: t.accentOn },
  emojiBtn: { width: 40, height: 40, borderWidth: 1.5, borderColor: t.border, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emojiBtnActive: { backgroundColor: t.accent, borderColor: "transparent" },
  hint: { fontSize: 12, color: t.text3, marginBottom: 6 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 6 },
  stepperBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: t.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.surface2,
  },
  stepperText: { fontSize: 20, color: t.text, fontFamily: FONTS.accent, lineHeight: 24 },
  stepperValue: { fontSize: 18, fontFamily: FONTS.accent, color: t.text, minWidth: 34, textAlign: "center" },
  map: { height: 220, borderRadius: 12, marginBottom: 4 },
  submitBtn: {
    backgroundColor: t.accent,
    borderRadius: RADIUS.base,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 6,
    marginBottom: 40,
    ...SHADOW.s2,
  },
  submitText: { color: t.accentOn, fontFamily: FONTS.accent, fontSize: 16, letterSpacing: 0.3 },
  error: {
    color: t.status.bad,
    backgroundColor: t.status.badSoft,
    borderColor: t.status.bad,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    fontSize: 13.5,
    fontWeight: "600",
  },
});
