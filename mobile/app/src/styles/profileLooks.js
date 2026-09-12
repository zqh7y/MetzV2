/**
 * The palettes behind a profile's frame and background.
 *
 * The API stores only an id and validates it against the same list of names;
 * the colours live here because a palette is a design decision that changes far
 * more often than an API does. Adding a look means editing this file and the
 * whitelist in data.py — nothing in between.
 *
 * Every entry carries `colors` for the gradient and a `label` key resolved
 * through i18n, so the names are translated like the rest of the app.
 */

// Backgrounds are the hero banner behind the avatar. `null` for the default
// means "use the theme's accent", so the app's own colour stays the default
// look and a theme change carries it along.
export const BACKGROUNDS = {
  default: { labelKey: "look.bgDefault", colors: null },
  ocean:   { labelKey: "look.bgOcean",   colors: ["#0ea5e9", "#1e3a8a"] },
  sunset:  { labelKey: "look.bgSunset",  colors: ["#f97316", "#be185d"] },
  forest:  { labelKey: "look.bgForest",  colors: ["#10b981", "#064e3b"] },
  berry:   { labelKey: "look.bgBerry",   colors: ["#a855f7", "#6d28d9"] },
  dusk:    { labelKey: "look.bgDusk",    colors: ["#6366f1", "#0f172a"] },
  mono:    { labelKey: "look.bgMono",    colors: ["#475569", "#0f172a"] },
};

// Frames ring the avatar. `width: 0` is the plain look — kept in the list so
// "no frame" is a choice someone can come back to, not the absence of one.
export const FRAMES = {
  none:   { labelKey: "look.frameNone",   width: 0, colors: [] },
  ring:   { labelKey: "look.frameRing",   width: 3, colors: ["#ffffff", "#ffffff"] },
  gold:   { labelKey: "look.frameGold",   width: 4, colors: ["#fbbf24", "#b45309"] },
  sunset: { labelKey: "look.frameSunset", width: 4, colors: ["#fb7185", "#f97316"] },
  ocean:  { labelKey: "look.frameOcean",  width: 4, colors: ["#38bdf8", "#2563eb"] },
  glow:   { labelKey: "look.frameGlow",   width: 4, colors: ["#a78bfa", "#22d3ee"] },
  dashed: { labelKey: "look.frameDashed", width: 3, colors: ["#ffffff", "#ffffff"], dashed: true },
};

/** Falls back to the default rather than throwing: the id comes off the wire. */
export function backgroundFor(id, theme) {
  const look = BACKGROUNDS[id] || BACKGROUNDS.default;
  // A single colour still has to be a two-stop gradient for the same component
  // to render every case without branching at the call site.
  return look.colors || [theme.accent, theme.accent];
}

export function frameFor(id) {
  return FRAMES[id] || FRAMES.none;
}
