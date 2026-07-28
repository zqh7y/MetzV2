/**
 * MapLibre is a native module, so it only exists in a development build or a
 * release APK — never in Expo Go, which ships a fixed set of native modules.
 *
 * Importing it there throws during module evaluation ("'MLRNCameraModule'
 * could not be found"), and because the map screens import it at the top level
 * that single failure takes down the whole bundle before anything renders.
 * Requiring it inside a try/catch keeps the crash contained to this file, and
 * `MAPS_AVAILABLE` lets a screen fall back to <WebMap>, which needs no native
 * code at all.
 */
let native = null;
try {
  native = require("@maplibre/maplibre-react-native");
} catch (e) {
  native = null;
}

export const MAPS_AVAILABLE = native != null;

// Placeholders so a screen that references these in a branch it never takes
// still resolves the names.
const Noop = () => null;

export const Map = MAPS_AVAILABLE ? native.Map : Noop;
export const Camera = MAPS_AVAILABLE ? native.Camera : Noop;
export const Marker = MAPS_AVAILABLE ? native.Marker : Noop;
export const GeoJSONSource = MAPS_AVAILABLE ? native.GeoJSONSource : Noop;
export const Layer = MAPS_AVAILABLE ? native.Layer : Noop;
export const UserLocation = MAPS_AVAILABLE ? native.UserLocation : Noop;
