// Port of the haversine helpers in static/home.js. Same earth radius and the
// same Infinity-for-no-coordinates rule, so a list sorted here lands in the
// same order it would on the web.

const R_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Kilometres from `me` to a meeting, or Infinity when either side has no
 * coordinates. Online meetings always come back Infinity — the API stores them
 * with lat/lng null — which is what sorts them to the end of a distance list.
 */
export function distanceToMeeting(me, meeting) {
  if (!me || !meeting?.lat || !meeting?.lng) return Infinity;
  return haversineDistance(me.latitude, me.longitude, meeting.lat, meeting.lng);
}

/** "340 m" / "1.2 km" / "18 km" — tighter units up close, no decimals far out. */
export function formatDistance(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
