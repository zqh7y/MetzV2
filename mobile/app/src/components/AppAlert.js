import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Modal, Pressable, StyleSheet, BackHandler } from "react-native";

import { FONTS } from "../styles/fonts";
import { RADIUS, SHADOW } from "../styles/theme";
import { useTheme } from "../context/ThemeContext";
import { useI18n } from "../context/LocaleContext";

/**
 * The app's own alert, replacing React Native's.
 *
 * The platform Alert draws itself with the OS's own dialog: system font, system
 * colours, system corner radius. In an app that ships its own type scale, four
 * accent themes and a dark mode, that dialog is the one surface that ignores
 * all of it — and on Android it cannot be styled at all. It also ignores the
 * in-app language: with the phone in English and Metz set to Hebrew, the
 * buttons still came out in the phone's language.
 *
 * The API is deliberately identical to the one it replaces:
 *
 *     Alert.alert("Title", "Message", [
 *       { text: "Cancel", style: "cancel" },
 *       { text: "Delete", style: "destructive", onPress: doIt },
 *     ]);
 *
 * so switching a screen over is a change of import and nothing else. Keeping
 * the shape also means the button `style` values React Native defines —
 * "cancel", "destructive", "default" — still mean what everyone expects.
 */

// ─── The imperative side ────────────────────────────────────────────────────
// A module-level channel, because alert() is called from event handlers, catch
// blocks and plain functions that have no access to a hook.

let deliver = null;
const pending = [];

function show(request) {
  if (deliver) deliver(request);
  // Fired before the host mounted (an error during startup, say) — hold it
  // rather than dropping it on the floor.
  else pending.push(request);
}

export const Alert = {
  /**
   * @param {string} title
   * @param {string} [message]
   * @param {Array<{text: string, onPress?: Function, style?: string}>} [buttons]
   * @param {{cancelable?: boolean, onDismiss?: Function}} [options]
   */
  alert(title, message, buttons, options) {
    show({ title, message, buttons, options });
  },
};

/**
 * Mounted once, near the root and inside the providers so it can read the
 * theme and the language. Renders nothing until something asks for it.
 */
export function AlertHost() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [request, setRequest] = useState(null);
  // Queued rather than replaced: two alerts firing together (a failed save that
  // also logs you out) should both be seen, in order.
  const queue = useRef([]);

  const next = useCallback(() => {
    setRequest(queue.current.length ? queue.current.shift() : null);
  }, []);

  useEffect(() => {
    deliver = (incoming) => {
      setRequest((current) => {
        if (current) {
          queue.current.push(incoming);
          return current;
        }
        return incoming;
      });
    };
    while (pending.length) deliver(pending.shift());
    return () => { deliver = null; };
  }, []);

  const buttons = request?.buttons?.length
    ? request.buttons
    // React Native shows a lone "OK" when no buttons are given, and enough
    // call sites rely on that to be worth reproducing.
    : [{ text: t("common.ok") }];

  const dismiss = useCallback((button) => {
    next();
    button?.onPress?.();
    if (!button) request?.options?.onDismiss?.();
  }, [next, request]);

  // Android's back button closes a system alert; it should close this one too,
  // but only when there is a safe way out — a dialog whose only button is
  // "Delete permanently" should not be dismissable by reflex.
  const cancelButton = buttons.find((b) => b.style === "cancel");
  const cancelable = request?.options?.cancelable !== false
    && (buttons.length === 1 || !!cancelButton);

  useEffect(() => {
    if (!request) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (cancelable) dismiss(cancelButton || buttons[0]);
      return true;   // swallow it either way, or the screen behind would pop
    });
    return () => sub.remove();
  }, [request, cancelable, cancelButton, buttons, dismiss]);

  if (!request) return null;

  // Two short buttons sit side by side, as the system dialog does. Three or
  // more, or anything wordy, stacks — side-by-side would truncate the labels,
  // and a truncated "Delete permanently" is genuinely dangerous.
  const stacked = buttons.length > 2 || buttons.some((b) => (b.text || "").length > 14);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {
      if (cancelable) dismiss(cancelButton || buttons[0]);
    }}>
      <Pressable
        style={styles.backdrop}
        onPress={() => { if (cancelable) dismiss(cancelButton || buttons[0]); }}
      >
        {/* Swallows taps so pressing the dialog itself does not dismiss it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          {request.title ? <Text style={styles.title}>{request.title}</Text> : null}
          {request.message ? <Text style={styles.message}>{request.message}</Text> : null}

          <View style={[styles.actions, stacked && styles.actionsStacked]}>
            {buttons.map((button, i) => {
              const destructive = button.style === "destructive";
              const cancel = button.style === "cancel";
              return (
                <Pressable
                  key={`${button.text}-${i}`}
                  style={[
                    styles.button,
                    stacked ? styles.buttonStacked : styles.buttonInline,
                    destructive && styles.buttonDestructive,
                    cancel && styles.buttonCancel,
                  ]}
                  onPress={() => dismiss(button)}
                  android_ripple={{ color: theme.surface3 }}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.buttonText,
                      destructive && styles.buttonTextDestructive,
                      cancel && styles.buttonTextCancel,
                    ]}
                    numberOfLines={2}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t) => StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: "rgba(10, 14, 24, 0.55)",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    padding: 22,
    borderRadius: RADIUS.lg,
    backgroundColor: t.surface,
    ...SHADOW.s3,
  },
  title: { fontSize: 17, fontFamily: FONTS.heading, color: t.text },
  // Only spaced from the title when there is a title to be spaced from.
  message: { marginTop: 8, fontSize: 14, lineHeight: 20, color: t.text2 },

  actions: { flexDirection: "row", gap: 8, marginTop: 20 },
  actionsStacked: { flexDirection: "column-reverse", gap: 8 },
  button: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: RADIUS.base,
    backgroundColor: t.accent,
    overflow: "hidden",
  },
  // Inline buttons share the row; stacked ones each take the full width. In a
  // column-reverse stack the first button ends up at the bottom, which keeps
  // the confirming action nearest the thumb.
  buttonInline: { flex: 1 },
  buttonStacked: { width: "100%" },
  buttonCancel: { backgroundColor: t.surface2 },
  buttonDestructive: { backgroundColor: t.status.badSoft || t.surface2 },

  buttonText: { fontSize: 15, fontFamily: FONTS.bodySemi, color: t.accentOn, textAlign: "center" },
  buttonTextCancel: { color: t.text2 },
  buttonTextDestructive: { color: t.status.bad },
});
