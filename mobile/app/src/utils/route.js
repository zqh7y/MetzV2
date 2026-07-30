/**
 * Road routing, ported from showRoute() in static/home.js.
 *
 * The same public OSRM demo server the web calls, asked for the same driving
 * profile and full GeoJSON geometry, so a route drawn in the app traces the
 * identical roads as the one on the site. It is a free shared service with no
 * uptime promise, which is why every caller here treats a failure as "no route
 * this time" rather than an error worth interrupting anyone over.
 */
const OSRM = "https://router.project-osrm.org/route/v1/driving";

/**
 * @returns {Promise<{coordinates: [number, number][], km: number, minutes: number} | null>}
 *          coordinates are [lng, lat], matching OSRM and MapLibre; null when
 *          there is no road route or the service did not answer.
 */
export async function fetchRoute(from, to) {
  if (!from || !to) return null;

  const url =
    `${OSRM}/${from.longitude},${from.latitude};${to.lng},${to.lat}`
    + "?overview=full&geometries=geojson";

  try {
    const res = await fetch(url);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return null;

    return {
      coordinates: route.geometry.coordinates,
      km: route.distance / 1000,
      minutes: Math.round(route.duration / 60),
    };
  } catch (e) {
    // Offline, blocked, or the demo server having a bad day.
    return null;
  }
}

/** "4.2 km · ~9 min" — the same summary the web puts under its map. */
export function formatRoute(route) {
  if (!route) return "";
  const km = route.km < 10 ? route.km.toFixed(1) : Math.round(route.km);
  const mins = route.minutes;
  const time = mins >= 60
    ? `${Math.floor(mins / 60)}h ${mins % 60}m`
    : `${mins} min`;
  return `${km} km · ~${time}`;
}
