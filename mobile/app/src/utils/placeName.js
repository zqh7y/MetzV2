import * as Location from "expo-location";

/**
 * Turn a dropped pin into something a person can read.
 *
 * The server stores a meeting's location as a *name*, not as coordinates —
 * "Sacher Park, Jerusalem" is what someone standing on a street corner can act
 * on, and a pair of decimals is not. So dropping a pin used to leave the
 * organiser to type the address themselves, which is work they have already
 * done by choosing the spot.
 *
 * This uses the platform's own geocoder through expo-location rather than a web
 * service: no key, no rate limit, no third party learning where every meeting
 * in the app is, and it answers in the phone's own language. The cost is that
 * Android routes it through Play services, so a device without them — and some
 * emulator images — answers with nothing at all. That is why every failure here
 * is silent and the text box stays editable: a name that could not be found is
 * the state the app was already in.
 */

/**
 * Two lines at most: where on the street, and which town.
 *
 * Android fills these fields inconsistently — a park has a `name` and no
 * `street`, a flat has a `street` and a `streetNumber`, and a field in the
 * middle of nowhere has neither — so each part is taken only if it is there,
 * and the result is whatever survives.
 */
export function formatPlace(place) {
  if (!place) return "";

  // Street first. `name` is the geocoder's own label for the spot, which for a
  // POI is the thing you would actually say ("Machane Yehuda Market") and for a
  // house is just the number — useless on its own, so it is only used when
  // there is no street to attach a number to.
  let line;
  if (place.street) {
    line = place.streetNumber ? `${place.street} ${place.streetNumber}` : place.street;
  } else if (place.name && place.name !== place.city) {
    line = place.name;
  }

  // Then the town. district is the neighbourhood, which is more use than the
  // city in a big one, but only when the city follows it.
  const town = place.city || place.subregion || place.region;

  const parts = [line, town].filter(Boolean);
  // Somewhere with no address at all still has a country, and "Greece" beats
  // an empty box when you have pinned a beach.
  if (!parts.length) return place.country || "";
  return parts.join(", ");
}

/**
 * Name the spot, or return "" — never throw.
 *
 * Callers treat an empty answer and a failed lookup identically on purpose:
 * both mean "the organiser types it themselves", which is what the screen did
 * before this existed.
 */
export async function placeNameFor(coords) {
  try {
    if (!coords || typeof coords.latitude !== "number") return "";
    const [place] = await Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    return formatPlace(place);
  } catch (e) {
    // No Play services, no network, or a geocoder that simply has nothing for
    // this spot. None of them are worth an alert over a field they can fill in.
    return "";
  }
}
