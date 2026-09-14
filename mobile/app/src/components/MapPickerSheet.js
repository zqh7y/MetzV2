import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Modal, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import WebMap from "./WebMap";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";
import { FONTS } from "../styles/fonts";
import { RADIUS } from "../styles/theme";

/**
 * Choosing a location on a map that fills the screen.
 *
 * The map used to sit inline in the Create form, inside a ScrollView, and that
 * is a fight the map cannot win: a vertical drag is both "pan the map" and
 * "scroll the page", and the ScrollView claims the gesture first. Panning to
 * find a street moved the page instead and the map never budged, so the only
 * reachable places were whatever happened to be in the small visible patch.
 *
 * Disabling the parent scroll while a finger is down does not fix it either —
 * on Android `scrollEnabled` does not cancel a gesture that has already
 * started, so the first drag still scrolls.
 *
 * Taking the map out of the scrolling page removes the conflict rather than
 * arbitrating it: in here nothing else wants the gesture, and the map gets the
 * whole screen to pan around, which is what the job actually needs.
 */
export default function MapPickerSheet({ visible, initialPin, center, zoom, onCancel, onConfirm }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [pin, setPin] = useState(initialPin || null);
  const webMapRef = useRef(null);

  // Opening starts from whatever the form already has, not from the last pin
  // dropped in a previous visit.
  useEffect(() => {
    if (visible) setPin(initialPin || null);
  }, [visible, initialPin]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <Pressable hitSlop={10} onPress={onCancel} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <Text style={styles.title}>{t("create.pickOnMap")}</Text>
          {/* Balances the close button so the title stays centred. */}
          <View style={styles.close} />
        </View>

        <View style={styles.mapArea}>
          <WebMap
            ref={webMapRef}
            style={StyleSheet.absoluteFill}
            theme={theme}
            center={pin ? [pin.longitude, pin.latitude] : center}
            zoom={pin ? 14 : zoom}
            pin={pin ? { lat: pin.latitude, lng: pin.longitude } : null}
            onMapPress={setPin}
          />        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={styles.hint} numberOfLines={1}>
            {pin
              ? `📍 ${pin.latitude.toFixed(4)}, ${pin.longitude.toFixed(4)}`
              : t("create.tapMapToPin")}
          </Text>
          <Pressable
            style={[styles.confirm, !pin && styles.confirmOff]}
            disabled={!pin}
            onPress={() => onConfirm(pin)}
          >
            <Text style={styles.confirmText}>{t("create.useThisSpot")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t) => StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingBottom: 12, backgroundColor: t.surface,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: t.fs(20), color: t.text2, fontFamily: FONTS.accent },
  title: { fontSize: t.fs(16), fontFamily: FONTS.heading, color: t.text },
  mapArea: { flex: 1 },
  footer: {
    paddingHorizontal: 16, paddingTop: 12, gap: 10,
    backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border,
  },
  hint: { fontSize: t.fs(13), color: t.text2, fontFamily: FONTS.bodyMedium, textAlign: "center" },
  confirm: {
    backgroundColor: t.accent, borderRadius: RADIUS.md,
    paddingVertical: 15, alignItems: "center",
  },
  confirmOff: { opacity: 0.45 },
  confirmText: { color: "#fff", fontSize: t.fs(16), fontFamily: FONTS.accent },
});
