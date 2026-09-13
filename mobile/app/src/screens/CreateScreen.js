import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Pressable,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";
import { Map, Camera, Marker, MAPS_AVAILABLE } from "../components/MapShim";
import WebMap from "../components/WebMap";
import MapPickerSheet from "../components/MapPickerSheet";
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
import { useI18n } from "../context/LocaleContext";
import { localizedTag } from "../i18n/vocab";
import { Alert } from "../components/AppAlert";

const CENTER = [35.2137, 31.7683]; // [lng, lat] — MapLibre order

// How long to wait for a GPS fix before giving up on it.
const LOCATE_TIMEOUT_MS = 12000;

/**
 * Resolve to null instead of waiting forever.
 *
 * getCurrentPositionAsync has no timeout of its own: with no fix available it
 * simply never settles. On the emulator — which never gets one — the button sat
 * on "Finding you…" indefinitely, and indoors on a real phone it would do the
 * same. The underlying request is left running; it is only stopped being waited
 * on.
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise.catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** The stored shape: "YYYY-MM-DD HH:MM", same as DateTimeField writes. */
function toServerTime(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} `
    + `${p(date.getHours())}:${p(date.getMinutes())}`;
}

/**
 * The three dates people actually pick, as one tap each.
 *
 * Setting a time was the slowest thing on this form: two dialogs, a date then
 * a clock, for what is almost always this evening or the weekend. The picker
 * is still there for anything else.
 *
 * `Tonight` is dropped once it is too late for it to mean tonight, rather than
 * offered and then rejected for being in the past — the field's minimumDate is
 * now, so a preset must never produce a moment that has already gone.
 */
function quickTimes(now) {
  const at = (date, hour) => {
    const out = new Date(date);
    out.setHours(hour, 0, 0, 0);
    return out;
  };

  const out = [];

  const tonight = at(now, 19);
  if (tonight > now) out.push({ key: "quickTonight", when: tonight });

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  out.push({ key: "quickTomorrow", when: at(tomorrow, 19) });

  // The coming Saturday at noon; if Saturday is today and noon has gone, the
  // weekend being offered is next week's.
  const weekend = new Date(now);
  weekend.setDate(weekend.getDate() + ((6 - weekend.getDay() + 7) % 7));
  let saturday = at(weekend, 12);
  if (saturday <= now) saturday = at(new Date(saturday.getTime() + 7 * 86400000), 12);
  out.push({ key: "quickWeekend", when: saturday });

  return out;
}
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
// Reads the translation itself rather than taking the finished "STEP 1" as a
// prop, so the five call sites keep passing a plain number.
function Section({ index, title, subtitle, Icon, children, styles, theme, delay }) {
  const { t } = useI18n();
  return (
    <Appear delay={delay}>
      <View style={styles.card}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionBadge}>
            <Icon size={17} color={theme.accentStrong} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionStep}>{t("create.step", { n: index })}</Text>
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
  const { t } = useI18n();
  const [type, setType] = useState("inperson");
  // Public unless the organiser says otherwise — the safe default is the one
  // where nothing is hidden by accident.
  const [isPrivate, setIsPrivate] = useState(false);
  const [time, setTime] = useState("");
  const [locationName, setLocationName] = useState("");
  const [pin, setPin] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
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
    if (!title.trim()) out.push(t("create.needTitle"));
    if (!description.trim()) out.push(t("create.needDescription"));
    if (!time) out.push(t("create.needDateTime"));
    if (isOnline && !link.trim()) out.push(t("create.needLink"));
    // A pin is not a location as far as the server is concerned:
    // validate_meeting_data() rejects an in-person meeting with an empty
    // location_name whether or not lat/lng came with it. This used to accept a
    // pin on its own, so dropping one and leaving the address blank lit up
    // "Ready to create" and then failed on submit with a server error.
    if (!isOnline && !locationName.trim()) out.push(t("create.needLocation"));
    return out;
  }, [title, description, time, isOnline, link, locationName, t]);

  /**
   * The one rule the server enforces that is not simply "don't leave it empty".
   *
   * Checked here so a missing scheme is caught while the field is in front of
   * you, rather than after a round trip that comes back as one line of English
   * from validate_meeting_data().
   */
  const linkInvalid = isOnline
    && link.trim() !== ""
    && !/^https?:\/\//i.test(link.trim());

  // Computed once per mount rather than per render: "tonight" must not vanish
  // from under a thumb because a re-render happened to land at 19:00:01.
  const quick = useMemo(() => quickTimes(new Date()), []);

  const cameraRef = useRef(null);
  const webMapRef = useRef(null);
  const [locating, setLocating] = useState(false);

  /**
   * Drop the pin where the organiser is standing.
   *
   * The map opens on the whole country at zoom 6.5, so pinning your own street
   * meant pinching your way down to it. Most meetings are made somewhere near
   * where they will happen, which makes this one tap instead.
   *
   * It only fills the pin. The address box stays for the organiser to write,
   * because the server wants a name a person can read and coordinates are not
   * that — see the note on `missing` above.
   */
  const handleUseMyLocation = useCallback(async () => {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("create.locationDeniedTitle"), t("create.locationDeniedBody"));
        return;
      }
      // Last known first: it is instant when there is one, and a cold fix
      // indoors can take long enough to look broken.
      //
      // The deadline covers both calls rather than just the live one. Capping
      // only getCurrentPositionAsync was not enough — on a device with no fix
      // at all, getLastKnownPositionAsync does not come back either, so the
      // button still sat on "Finding you…" forever.
      const fix = await withTimeout((async () =>
        (await Location.getLastKnownPositionAsync())
        || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
      )(), LOCATE_TIMEOUT_MS);
      if (!fix) {
        Alert.alert(t("create.locationFailed"), "");
        return;
      }
      const next = { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
      setPin(next);
      const camera = MAPS_AVAILABLE ? cameraRef.current : webMapRef.current;
      camera?.flyTo({ center: [next.longitude, next.latitude], zoom: 15, duration: 700 });
    } catch (e) {
      Alert.alert(t("create.locationFailed"), e.message || "");
    } finally {
      setLocating(false);
    }
  }, [locating, t]);

  const ready = missing.length === 0 && !linkInvalid;

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
        visibility: isPrivate ? "private" : "public",
      };
      const res = await api.createMeeting(payload);
      // The alert that used to be here said "created" and dropped the organiser
      // back on the map with nothing to act on — the moment they have the most
      // to do and the least idea what. replace() rather than navigate(): going
      // back to a form that has already been submitted offers a second submit.
      navigation.replace("MeetingCreated", {
        meetingId: res.id,
        status: res.status,
        shareUrl: res.share_url,
        title,
      });
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
              <Text style={styles.headerTitle}>{t("create.headerTitle")}</Text>
              <Text style={styles.headerSub}>{t("create.headerSub")}</Text>
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
                {title.trim() || t("create.previewTitle")}
              </Text>
              <Text style={styles.previewMeta} numberOfLines={1}>
                {isOnline
                  ? `🌐 ${t("common.online")}`
                  : `📍 ${locationName.trim() || t(pin ? "create.pinnedOnMap" : "create.noLocationYet")}`}
              </Text>
              <Text style={styles.previewMeta} numberOfLines={1}>
                {time || t("create.noDateYet")}
              </Text>
            </View>
          </View>
        </Appear>

        {error ? (
          <Appear offset={-6}>
            <Text style={styles.error}>⚠  {error}</Text>
          </Appear>
        ) : null}

        <Section index={1} title={t("create.sectionBasics")} Icon={TagIcon} styles={styles} theme={theme} delay={110}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>{t("create.meetingTitle")}</Text>
            <Text style={styles.counter}>{title.length}/{MAX_TITLE}</Text>
          </View>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            maxLength={MAX_TITLE}
            placeholder={t("create.titlePlaceholder")}
            placeholderTextColor={theme.text3}
          />

          <View style={styles.labelRow}>
            <Text style={styles.label}>{t("create.description")}</Text>
            <Text style={styles.counter}>{description.length}/{MAX_DESC}</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            maxLength={MAX_DESC}
            placeholder={t("create.descriptionPlaceholder")}
            placeholderTextColor={theme.text3}
          />
        </Section>

        <Section
          index={2}
          title={t("create.sectionWhere")}
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
              <Text style={[styles.typeText, !isOnline && styles.typeTextActive]}>{t("common.inPerson")}</Text>
            </Pressable>
            <Pressable
              style={[styles.typeBtn, isOnline && styles.typeBtnActive]}
              onPress={() => setType("online")}
            >
              <GlobeIcon size={17} color={isOnline ? theme.accentOn : theme.text2} />
              <Text style={[styles.typeText, isOnline && styles.typeTextActive]}>{t("common.online")}</Text>
            </Pressable>
          </View>

          {isOnline ? (
            <>
              <Text style={styles.label}>{t("create.meetingLink")}</Text>
              <TextInput
                style={[styles.input, linkInvalid && styles.inputBad]}
                value={link}
                onChangeText={setLink}
                placeholder="https://zoom.us/j/..."
                placeholderTextColor={theme.text3}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              {linkInvalid ? (
                <Text style={styles.hintBad}>{t("create.linkNeedsScheme")}</Text>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.label}>{t("create.location")}</Text>
              <TextInput
                style={styles.input}
                value={locationName}
                onChangeText={setLocationName}
                placeholder={t("create.locationPlaceholder")}
                placeholderTextColor={theme.text3}
              />

              <TouchableOpacity
                style={[styles.locateBtn, locating && styles.locateBtnBusy]}
                onPress={handleUseMyLocation}
                disabled={locating}
                activeOpacity={0.85}
              >
                {locating
                  ? <ActivityIndicator size="small" color={theme.accentStrong} />
                  : <MapPinIcon size={15} color={theme.accentStrong} />}
                <Text style={styles.locateBtnText}>
                  {locating ? t("create.locating") : t("create.useMyLocation")}
                </Text>
              </TouchableOpacity>

              {/* A preview, not a workspace. Panning happens in the full-screen
                  picker, where nothing competes for the drag — see
                  MapPickerSheet. Touches here only open it, so the page keeps
                  scrolling normally over this area. */}
              <Pressable
                style={styles.mapWrap}
                pointerEvents="box-only"
                onPress={() => setMapOpen(true)}
              >
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
                    <Camera ref={cameraRef} initialViewState={{ center: CENTER, zoom: 6.5 }} />
                    {pin ? <Marker lngLat={[pin.longitude, pin.latitude]} /> : null}
                  </Map>
                ) : (
                  <WebMap
                    ref={webMapRef}
                    style={styles.map}
                    theme={theme}
                    center={CENTER}
                    zoom={6.5}
                    pin={pin ? { lat: pin.latitude, lng: pin.longitude } : null}
                    onMapPress={setPin}
                  />
                )}
              </Pressable>
              <Pressable style={styles.mapOpen} onPress={() => setMapOpen(true)}>
                <Text style={styles.mapOpenText}>{`🗺  ${t("create.pickOnMap")}`}</Text>
              </Pressable>

              <MapPickerSheet
                visible={mapOpen}
                initialPin={pin}
                center={CENTER}
                zoom={6.5}
                onCancel={() => setMapOpen(false)}
                onConfirm={(picked) => {
                  setMapOpen(false);
                  setPin(picked);
                }}
              />

              <Text style={[styles.hint, pin && styles.hintDone]}>
                {pin
                  ? `📍 ${t("create.pinDropped", { coords: `${pin.latitude.toFixed(4)}, ${pin.longitude.toFixed(4)}` })}`
                  // Tapping the preview opens the picker rather than dropping
                  // a pin where you touched, so it must not promise otherwise.
                  : `📍 ${t("create.pickOnMap")}`}
              </Text>
            </>
          )}
        </Section>

        <Section
          index={3}
          title={t("create.sectionWhen")}
          subtitle={t("create.whenSub")}
          Icon={CalendarIcon}
          styles={styles}
          theme={theme}
          delay={210}
        >
          {/* Above the picker, not instead of it: these three cover the common
              cases, and anything else is still one tap further down. */}
          <Text style={styles.label}>{t("create.quickPick")}</Text>
          <View style={styles.quickRow}>
            {quick.map(({ key, when }) => {
              const value = toServerTime(when);
              const active = time === value;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.quickBtn, active && styles.quickBtnActive]}
                  onPress={() => setTime(active ? "" : value)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.quickText, active && styles.quickTextActive]}>
                    {t(`create.${key}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <DateTimeField value={time} onChange={setTime} minimumDate={new Date()} />
        </Section>

        <Section
          index={4}
          title={t("create.sectionCommitment")}
          subtitle={t("create.commitmentSub")}
          Icon={UsersIcon}
          styles={styles}
          theme={theme}
          delay={260}
        >
          <Text style={styles.label}>{t("create.whoCanFind")}</Text>
          <View style={styles.typeRow}>
            <Pressable
              style={[styles.typeBtn, !isPrivate && styles.typeBtnActive]}
              onPress={() => setIsPrivate(false)}
            >
              <Text style={[styles.typeText, !isPrivate && styles.typeTextActive]}>
                {t("create.visibilityPublic")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.typeBtn, isPrivate && styles.typeBtnActive]}
              onPress={() => setIsPrivate(true)}
            >
              <Text style={[styles.typeText, isPrivate && styles.typeTextActive]}>
                {t("create.visibilityPrivate")}
              </Text>
            </Pressable>
          </View>
          {/* Spelled out rather than left to the label: "private" could equally
              mean invite-only or hidden-but-joinable, and the difference
              matters before someone commits to it. */}
          <Text style={styles.visibilityNote}>
            {isPrivate ? t("create.visibilityPrivateNote") : t("create.visibilityPublicNote")}
          </Text>

          <Text style={styles.label}>{t("create.howManyNeeded")}</Text>
          <View style={styles.typeRow}>
            <Pressable
              style={[styles.typeBtn, !needsMinimum && styles.typeBtnActive]}
              onPress={() => setNeedsMinimum(false)}
            >
              <Text style={[styles.typeText, !needsMinimum && styles.typeTextActive]}>{t("create.openToAll")}</Text>
            </Pressable>
            <Pressable
              style={[styles.typeBtn, needsMinimum && styles.typeBtnActive]}
              onPress={() => setNeedsMinimum(true)}
            >
              <Text style={[styles.typeText, needsMinimum && styles.typeTextActive]}>{t("create.needsMinimum")}</Text>
            </Pressable>
          </View>

          {needsMinimum ? (
            <Appear offset={8} duration={240}>
              <Text style={styles.label}>{t("create.minimumPeople")}</Text>
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

              <Text style={styles.label}>{t("create.joinBy")}</Text>
              <DateTimeField
                value={joinDeadline}
                onChange={setJoinDeadline}
                placeholder={t("create.pickDeadline")}
                minimumDate={new Date()}
              />
              <Text style={styles.hint}>{t("create.deadlineHint")}</Text>

              <Text style={styles.label}>{t("create.maximumOptional")}</Text>
              <TextInput
                style={styles.input}
                value={maxAttendees}
                onChangeText={setMaxAttendees}
                keyboardType="number-pad"
                placeholder={t("create.noLimit")}
                placeholderTextColor={theme.text3}
              />
              <Text style={styles.hint}>
                {t("create.waitlistHint")}
              </Text>
            </Appear>
          ) : null}
        </Section>

        <Section
          index={5}
          title={t("create.sectionDetails")}
          subtitle={t("create.detailsSub")}
          Icon={TagIcon}
          styles={styles}
          theme={theme}
          delay={310}
        >
          <View style={styles.labelRow}>
            <Text style={styles.label}>{t("create.interests")}</Text>
            {tags.length ? <Text style={styles.counter}>{t("create.tagsPicked", { count: tags.length })}</Text> : null}
          </View>
          <View style={styles.tagWrap}>
            {/* The loop variable used to be `t`, which shadowed the translate
                function for the whole block — so the tag label could not be
                localised without renaming it first. */}
            {allTags.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.tagBtn, tags.includes(tag) && styles.tagBtnActive]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[styles.tagBtnText, tags.includes(tag) && styles.tagBtnTextActive]}>{localizedTag(t, tag)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>{t("create.mapIcon")}</Text>
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
          {ready
            ? t("create.readyToCreate")
            /* A bad link is not a blank field, so it needs saying in its own
               words — "still needed: link" is wrong when a link is right there. */
            : linkInvalid && !missing.length
              ? t("create.linkNeedsScheme")
              : t("create.stillNeeded", { fields: missing.join(", ") })}
        </Text>
        <AnimatedPressable
          style={[styles.submitBtn, (!ready || submitting) && styles.submitBtnInert]}
          onPress={handleSubmit}
          disabled={!ready || submitting}
        >
          <Text style={[styles.submitText, (!ready || submitting) && styles.submitTextInert]}>
            {submitting ? t("create.creating") : t("create.submit")}
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
  headerTitle: { fontSize: t.fs(20), fontFamily: FONTS.headingExtra, color: t.text },
  headerSub: { fontSize: t.fs(13), color: t.text2, marginTop: 1 },

  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: t.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: t.border,
    borderStartWidth: 4,
    borderStartColor: t.accent,
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
  previewTitle: { fontSize: t.fs(15), fontFamily: FONTS.heading, color: t.text },
  previewMeta: { fontSize: t.fs(11.5), color: t.text3, marginTop: 2 },

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
    fontSize: t.fs(9.5),
    fontFamily: FONTS.accent,
    color: t.text3,
    letterSpacing: 1,
  },
  sectionTitle: { fontSize: t.fs(16), fontFamily: FONTS.heading, color: t.text },
  sectionSub: { fontSize: t.fs(12), color: t.text3, lineHeight: 17, marginTop: 6 },

  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: {
    fontSize: t.fs(11),
    fontFamily: FONTS.bodySemi,
    color: t.text3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 7,
  },
  counter: { fontSize: t.fs(11), color: t.text3, marginTop: 9, fontFamily: FONTS.accentMedium },
  input: {
    borderWidth: 1.5,
    borderColor: t.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: t.fs(14),
    color: t.text,
    backgroundColor: t.surface2,
  },
  textarea: { height: 88 },

  visibilityNote: { fontSize: t.fs(12.5), lineHeight: 18, color: t.text3, marginTop: 8, marginBottom: 4 },
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
  typeText: { fontSize: t.fs(13.5), fontFamily: FONTS.bodySemi, color: t.text2 },
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
  tagBtnText: { fontSize: t.fs(12), fontFamily: FONTS.bodySemi, color: t.text2 },
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

  hint: { fontSize: t.fs(12), color: t.text3, marginTop: 8 },
  hintDone: { color: t.accentStrong, fontFamily: FONTS.bodySemi },
  hintBad: { fontSize: t.fs(12), color: t.status.bad, marginTop: 8, fontFamily: FONTS.bodySemi },
  inputBad: { borderColor: t.status.bad },

  // "Use my location" — outlined rather than filled, so it reads as a shortcut
  // for the field above it and not as the section's main action.
  locateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: RADIUS.base,
    borderWidth: 1,
    borderColor: t.accent,
    backgroundColor: t.accentSoft,
  },
  locateBtnBusy: { opacity: 0.7 },
  locateBtnText: { fontSize: t.fs(13.5), fontFamily: FONTS.bodySemi, color: t.accentStrong },

  quickRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  quickBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.surface2,
  },
  quickBtnActive: { backgroundColor: t.accent, borderColor: t.accent },
  quickText: { fontSize: t.fs(12.5), fontFamily: FONTS.bodySemi, color: t.text2 },
  quickTextActive: { color: t.accentOn },

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
  stepperText: { fontSize: t.fs(20), color: t.text, fontFamily: FONTS.accent, lineHeight: 24 },
  stepperValue: { fontSize: t.fs(18), fontFamily: FONTS.accent, color: t.text, minWidth: 34, textAlign: "center" },

  // #create-map: 240px with a 1.5px border on the web
  mapOpen: {
    marginTop: 10, paddingVertical: 12, borderRadius: RADIUS.md,
    alignItems: "center", backgroundColor: t.accentSoft,
    borderWidth: 1, borderColor: t.accent,
  },
  mapOpenText: { fontSize: t.fs(14), fontFamily: FONTS.accent, color: t.accentStrong },
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
  actionHint: { fontSize: t.fs(11.5), color: t.text3, marginBottom: 9, fontFamily: FONTS.bodySemi },
  actionHintReady: { color: t.status.good },
  submitBtn: {
    backgroundColor: t.accent,
    borderRadius: RADIUS.base,
    paddingVertical: 15,
    alignItems: "center",
    ...SHADOW.s2,
  },
  submitBtnInert: { backgroundColor: t.surface3, shadowOpacity: 0, elevation: 0 },
  submitText: { color: t.accentOn, fontFamily: FONTS.accent, fontSize: t.fs(16), letterSpacing: 0.3 },
  submitTextInert: { color: t.text3 },

  error: {
    color: t.status.bad,
    backgroundColor: t.status.badSoft,
    borderColor: t.status.bad,
    borderWidth: 1,
    borderStartWidth: 4,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    fontSize: t.fs(13.5),
    fontFamily: FONTS.bodySemi,
  },
});
