import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert,
  Pressable, KeyboardAvoidingView, Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Map, Camera, Marker, MAPS_AVAILABLE } from "../components/MapShim";
import WebMap from "../components/WebMap";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import AnimatedPressable from "../components/AnimatedPressable";
import Appear from "../components/Appear";
import DateTimeField from "../components/DateTimeField";
import {
  CalendarPlusIcon, MapPinIcon, GlobeIcon, CalendarIcon, UsersIcon, TagIcon,
} from "../components/NavIcons";
import { FONTS } from "../styles/fonts";
import { useTheme } from "../context/ThemeContext";
import { RADIUS, SHADOW } from "../styles/theme";

const CENTER = [35.2137, 31.7683]; // [lng, lat] — MapLibre order
const EMOJIS = ["📍", "🎉", "☕", "🍕", "🎮", "🎵", "📚", "⚽", "🧘", "🎨", "💻", "🌐", "🎬", "🚴", "🏕️", "🍻"];
const MAX_TITLE = 100;
const MAX_DESC = 500;

// .create-header-icon uses this gradient rather than the accent, and it stays
// fixed on both sides — it is part of the page's identity, not theming.
const HEADER_GRADIENT = ["#43e97b", "#38f9d7"];

/**
 * A titled block with a numbered badge.
 *
 * The screen used to be four visually identical cards with every label at the
 * same weight, so there was nothing to read the form's shape from — it scanned
 * as one undifferentiated column. The web solves this by splitting the form
 * into six named steps; this keeps the single scroll but borrows the naming, so
 * the sections are findable without taking away the ability to see everything
 * at once.
 */
function Section({ index, title, subtitle, Icon, children, styles, theme, delay }) {
  return (
    <Appear delay={delay}>
      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionBadge}>
            <Icon size={17} color={theme.accentStrong} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionStep}>STEP {index}</Text>
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
        </View>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
        {children}
      </View>
    </Appear>
  );
}

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
  const [submitting, setSubmitting] = useState(false);

  // Step 4 on the web: a meeting can require a minimum before it counts as on.
  const [needsMinimum, setNeedsMinimum] = useState(false);
  const [minAttendees, setMinAttendees] = useState(4);
  const [maxAttendees, setMaxAttendees] = useState("");
  const [joinDeadline, setJoinDeadline] = useState("");

  useEffect(() => {
    api.getTags().then(setAllTags).catch(() => {});
  }, []);

  const toggleTag = useCallback((tag) => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }, []);

  const isOnline = type === "online";

  // What still has to be filled in. Shown as a count on the action bar so the
  // button explains itself instead of failing on submit.
  const missing = useMemo(() => {
    const out = [];
    if (!title.trim()) out.push("title");
    if (!description.trim()) out.push("description");
    if (!time) out.push("date & time");
    if (isOnline && !link.trim()) out.push("link");
    if (!isOnline && !locationName.trim() && !pin) out.push("location");
    return out;
  }, [title, description, time, isOnline, link, locationName, pin]);

  const ready = missing.length === 0;

  async function handleSubmit() {
    if (!ready || submitting) return;
    setSubmitting(true);
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
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingTop: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* .create-header — gradient tile beside the title */}
        <Appear>
          <View style={styles.header}>
            <LinearGradient
              colors={HEADER_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerIcon}
            >
              <CalendarPlusIcon size={22} color="#fff" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Create a New Meeting</Text>
              <Text style={styles.headerSub}>Share something fun with your community</Text>
            </View>
          </View>
        </Appear>

        {/* A standing version of the web's review step: what you are making,
            visible while you make it, rather than only at the end. */}
        <Appear delay={60}>
          <View style={styles.preview}>
            <View style={styles.previewEmoji}>
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewTitle} numberOfLines={1}>
                {title.trim() || "Your meeting title"}
              </Text>
              <Text style={styles.previewMeta} numberOfLines={1}>
                {isOnline ? "🌐 Online" : `📍 ${locationName.trim() || (pin ? "Pinned on map" : "No location yet")}`}
              </Text>
              <Text style={styles.previewMeta} numberOfLines={1}>
                {time || "No date yet"}
              </Text>
            </View>
          </View>
        </Appear>

        {error ? (
          <Appear offset={-6}>
            <Text style={styles.error}>⚠  {error}</Text>
          </Appear>
        ) : null}

        <Section index={1} title="Basics" Icon={TagIcon} styles={styles} theme={theme} delay={110}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Meeting title</Text>
            <Text style={styles.counter}>{title.length}/{MAX_TITLE}</Text>
          </View>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            maxLength={MAX_TITLE}
            placeholder="e.g. Morning Yoga Session"
            placeholderTextColor={theme.text3}
          />

          <View style={styles.labelRow}>
            <Text style={styles.label}>Description</Text>
            <Text style={styles.counter}>{description.length}/{MAX_DESC}</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            maxLength={MAX_DESC}
            placeholder="What is this meeting about?"
            placeholderTextColor={theme.text3}
          />
        </Section>

        <Section
          index={2}
          title="Where"
          Icon={isOnline ? GlobeIcon : MapPinIcon}
          styles={styles}
          theme={theme}
          delay={160}
        >
          {/* .type-toggle — two equal options, icon beside label */}
          <View style={styles.typeRow}>
            <Pressable
              style={[styles.typeBtn, !isOnline && styles.typeBtnActive]}
              onPress={() => setType("inperson")}
            >
              <MapPinIcon size={17} color={!isOnline ? theme.accentOn : theme.text2} />
              <Text style={[styles.typeText, !isOnline && styles.typeTextActive]}>In-Person</Text>
            </Pressable>
            <Pressable
              style={[styles.typeBtn, isOnline && styles.typeBtnActive]}
              onPress={() => setType("online")}
            >
              <GlobeIcon size={17} color={isOnline ? theme.accentOn : theme.text2} />
              <Text style={[styles.typeText, isOnline && styles.typeTextActive]}>Online</Text>
            </Pressable>
          </View>

          {isOnline ? (
            <>
              <Text style={styles.label}>Meeting link</Text>
              <TextInput
                style={styles.input}
                value={link}
                onChangeText={setLink}
                placeholder="https://zoom.us/j/..."
                placeholderTextColor={theme.text3}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </>
          ) : (
            <>
              <Text style={styles.label}>Location</Text>
              <TextInput
                style={styles.input}
                value={locationName}
                onChangeText={setLocationName}
                placeholder="Type an address or pick on the map below"
                placeholderTextColor={theme.text3}
              />
              <View style={styles.mapWrap}>
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
              </View>
              <Text style={[styles.hint, pin && styles.hintDone]}>
                {pin
                  ? `📍 Pin dropped at ${pin.latitude.toFixed(4)}, ${pin.longitude.toFixed(4)}`
                  : "📍 Tap the map to drop a pin"}
              </Text>
            </>
          )}
        </Section>

        <Section
          index={3}
          title="When"
          subtitle="Pick when people should show up."
          Icon={CalendarIcon}
          styles={styles}
          theme={theme}
          delay={210}
        >
          <DateTimeField value={time} onChange={setTime} minimumDate={new Date()} />
        </Section>

        <Section
          index={4}
          title="Commitment"
          subtitle="Set a minimum and nobody has to wonder whether it's actually on. If it doesn't fill by the deadline, you decide what to do — it never shows up as a failed event."
          Icon={UsersIcon}
          styles={styles}
          theme={theme}
          delay={260}
        >
          <View style={styles.typeRow}>
            <Pressable
              style={[styles.typeBtn, !needsMinimum && styles.typeBtnActive]}
              onPress={() => setNeedsMinimum(false)}
            >
              <Text style={[styles.typeText, !needsMinimum && styles.typeTextActive]}>Open to all</Text>
            </Pressable>
            <Pressable
              style={[styles.typeBtn, needsMinimum && styles.typeBtnActive]}
              onPress={() => setNeedsMinimum(true)}
            >
              <Text style={[styles.typeText, needsMinimum && styles.typeTextActive]}>Needs a minimum</Text>
            </Pressable>
          </View>

          {needsMinimum ? (
            <Appear offset={8} duration={240}>
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
              <DateTimeField
                value={joinDeadline}
                onChange={setJoinDeadline}
                placeholder="Pick a deadline"
                minimumDate={new Date()}
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
            </Appear>
          ) : null}
        </Section>

        <Section
          index={5}
          title="Details"
          subtitle="Interests help the right people find it."
          Icon={TagIcon}
          styles={styles}
          theme={theme}
          delay={310}
        >
          <View style={styles.labelRow}>
            <Text style={styles.label}>Interests</Text>
            {tags.length ? <Text style={styles.counter}>{tags.length} picked</Text> : null}
          </View>
          <View style={styles.tagWrap}>
            {allTags.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tagBtn, tags.includes(t) && styles.tagBtnActive]}
                onPress={() => toggleTag(t)}
              >
                <Text style={[styles.tagBtnText, tags.includes(t) && styles.tagBtnTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Map icon</Text>
          <View style={styles.tagWrap}>
            {EMOJIS.map((e) => (
              <TouchableOpacity
                key={e}
                style={[styles.emojiBtn, emoji === e && styles.emojiBtnActive]}
                onPress={() => setEmoji(e)}
              >
                <Text style={{ fontSize: 18 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>
      </ScrollView>

      {/* Pinned rather than sitting at the end of a long scroll, so the action
          and what is blocking it are both always in view. */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={[styles.actionHint, ready && styles.actionHintReady]} numberOfLines={1}>
          {ready ? "Ready to create" : `Still needed: ${missing.join(", ")}`}
        </Text>
        <AnimatedPressable
          style={[styles.submitBtn, (!ready || submitting) && styles.submitBtnInert]}
          onPress={handleSubmit}
          disabled={!ready || submitting}
        >
          <Text style={[styles.submitText, (!ready || submitting) && styles.submitTextInert]}>
            {submitting ? "Creating…" : "Create Meeting"}
          </Text>
        </AnimatedPressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (t) => StyleSheet.create({
  flex: { flex: 1, backgroundColor: t.bg },
  container: { flex: 1, backgroundColor: t.bg },

  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 16 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#43e97b",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  headerTitle: { fontSize: 20, fontFamily: FONTS.headingExtra, color: t.text },
  headerSub: { fontSize: 13, color: t.text2, marginTop: 1 },

  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    borderLeftWidth: 4,
    borderLeftColor: t.accent,
    padding: 14,
    marginBottom: 16,
    ...SHADOW.s1,
  },
  previewEmoji: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: t.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  previewTitle: { fontSize: 15, fontFamily: FONTS.heading, color: t.text },
  previewMeta: { fontSize: 11.5, color: t.text3, marginTop: 2 },

  card: {
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    padding: 16,
    marginBottom: 14,
    ...SHADOW.s1,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 4 },
  sectionBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: t.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionStep: {
    fontSize: 9.5,
    fontFamily: FONTS.accent,
    color: t.text3,
    letterSpacing: 1,
  },
  sectionTitle: { fontSize: 16, fontFamily: FONTS.heading, color: t.text },
  sectionSub: { fontSize: 12, color: t.text3, lineHeight: 17, marginTop: 6 },

  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: {
    fontSize: 11,
    fontFamily: FONTS.bodySemi,
    color: t.text3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 7,
  },
  counter: { fontSize: 11, color: t.text3, marginTop: 9, fontFamily: FONTS.accentMedium },
  input: {
    borderWidth: 1.5,
    borderColor: t.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: t.text,
    backgroundColor: t.surface2,
  },
  textarea: { height: 88 },

  typeRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  typeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1.5,
    borderColor: t.border,
    borderRadius: 10,
    paddingVertical: 12,
    backgroundColor: t.surface2,
  },
  typeBtnActive: { backgroundColor: t.accent, borderColor: t.accent },
  typeText: { fontSize: 13.5, fontFamily: FONTS.bodySemi, color: t.text2 },
  typeTextActive: { color: t.accentOn },

  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagBtn: {
    borderWidth: 1.5,
    borderColor: t.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: t.surface2,
  },
  tagBtnActive: { backgroundColor: t.accent, borderColor: t.accent },
  tagBtnText: { fontSize: 12, fontFamily: FONTS.bodySemi, color: t.text2 },
  tagBtnTextActive: { color: t.accentOn },
  emojiBtn: {
    width: 42,
    height: 42,
    borderWidth: 1.5,
    borderColor: t.border,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.surface2,
  },
  emojiBtnActive: { backgroundColor: t.accentSoft, borderColor: t.accent },

  hint: { fontSize: 12, color: t.text3, marginTop: 8 },
  hintDone: { color: t.accentStrong, fontFamily: FONTS.bodySemi },

  stepper: { flexDirection: "row", alignItems: "center", gap: 14 },
  stepperBtn: {
    width: 42,
    height: 42,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: t.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: t.surface2,
  },
  stepperText: { fontSize: 20, color: t.text, fontFamily: FONTS.accent, lineHeight: 24 },
  stepperValue: { fontSize: 18, fontFamily: FONTS.accent, color: t.text, minWidth: 34, textAlign: "center" },

  // #create-map: 240px with a 1.5px border on the web
  mapWrap: {
    height: 240,
    borderRadius: RADIUS.base,
    borderWidth: 1.5,
    borderColor: t.border,
    overflow: "hidden",
    marginTop: 10,
  },
  map: { flex: 1 },

  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: t.surface,
    borderTopWidth: 1,
    borderTopColor: t.border,
    shadowColor: "#101428",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  actionHint: { fontSize: 11.5, color: t.text3, marginBottom: 9, fontFamily: FONTS.bodySemi },
  actionHintReady: { color: t.status.good },
  submitBtn: {
    backgroundColor: t.accent,
    borderRadius: RADIUS.base,
    paddingVertical: 15,
    alignItems: "center",
    ...SHADOW.s2,
  },
  submitBtnInert: { backgroundColor: t.surface3, shadowOpacity: 0, elevation: 0 },
  submitText: { color: t.accentOn, fontFamily: FONTS.accent, fontSize: 16, letterSpacing: 0.3 },
  submitTextInert: { color: t.text3 },

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
    fontFamily: FONTS.bodySemi,
  },
});
