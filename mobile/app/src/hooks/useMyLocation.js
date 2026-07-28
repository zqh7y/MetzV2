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
