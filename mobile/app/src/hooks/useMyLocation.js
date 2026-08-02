import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";

/**
 * The device's position, for the "you are here" marker on Home.
 *
 * The map runs inside a WebView, and the WebView's navigator.geolocation never
 * gets a permission prompt in Expo Go — it just fails quietly, which is why
 * the app never showed a location at all. Asking through expo-location on the
 * native side gets a real prompt, and the coordinates are handed to the map.
 *
 * Returns { latitude, longitude } once known, or null: a declined permission
 * is a normal outcome here, not an error to surface.
 */
export default function useMyLocation(enabled = true) {
  const [position, setPosition] = useState(null);
  const watcher = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!enabled) return;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== "granted") return;

        // One immediate fix so the marker appears without waiting for the
        // first watch update, which can take a while indoors.
        const first = await Location.getLastKnownPositionAsync();
        if (!cancelled && first) {
          setPosition({ latitude: first.coords.latitude, longitude: first.coords.longitude });
        }

        watcher.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 10000 },
          (update) => {
            if (!cancelled) {
              setPosition({ latitude: update.coords.latitude, longitude: update.coords.longitude });
            }
          }
        );

        // Nothing cached to show yet. getLastKnownPositionAsync returns null on
        // a fresh install, after a reboot, or when location was only just
        // switched on — and the watch above only fires when the device decides
        // it has moved far enough, so indoors it can stay silent for minutes.
        // To the user that is indistinguishable from "the app can't find me".
        // One active request settles it.
        //
        // Deliberately started after the watch, so it never delays the thing
        // that provides every later update, and its failure is not an error:
        // the watch is still running either way.
        if (!first && !cancelled) {
          try {
            const now = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            if (!cancelled && now) {
              setPosition({ latitude: now.coords.latitude, longitude: now.coords.longitude });
            }
          } catch (e) {
            // No fix obtainable right now; the watch remains the way this resolves.
          }
        }
      } catch (e) {
        // No location services, airplane mode, emulator without a fix — the
        // map is perfectly usable without a blue dot.
      }
    }

    start();
    return () => {
      cancelled = true;
      watcher.current?.remove();
      watcher.current = null;
    };
  }, [enabled]);

  return position;
}
