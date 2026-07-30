// ─── Design tokens, mirrored from the web app's :root in static/style.css ────
// The two apps are meant to look like one product, so every colour, radius and
// shadow here has a counterpart in the stylesheet. When one side changes, the
// other should change with it — that is the whole point of this file existing
// instead of hex codes scattered through the screens.

// Functional accent. `teal` is the default on both sides; the other three are
// the choices the web Settings screen offers under data-accent.
export const ACCENTS = {
  teal: {
    accent: "#0d9c8a",
    accentStrong: "#0a7d6e",
    accentDeep: "#075f55",
    accentSoft: "rgba(13, 156, 138, 0.12)",
    accentSoft2: "rgba(13, 156, 138, 0.22)",
    accentGlow: "rgba(13, 156, 138, 0.38)",
  },
  indigo: {
    accent: "#667eea",
    accentStrong: "#764ba2",
    accentDeep: "#4c3a86",
    accentSoft: "rgba(102, 126, 234, 0.12)",
    accentSoft2: "rgba(102, 126, 234, 0.22)",
    accentGlow: "rgba(102, 126, 234, 0.38)",
  },
  coral: {
    accent: "#f5576c",
    accentStrong: "#d63a55",
    accentDeep: "#a72840",
    accentSoft: "rgba(245, 87, 108, 0.12)",
    accentSoft2: "rgba(245, 87, 108, 0.22)",
    accentGlow: "rgba(245, 87, 108, 0.38)",
  },
  amber: {
    accent: "#e08c1a",
    accentStrong: "#b96f0d",
    accentDeep: "#8c5308",
    accentSoft: "rgba(224, 140, 26, 0.14)",
    accentSoft2: "rgba(224, 140, 26, 0.24)",
    accentGlow: "rgba(224, 140, 26, 0.40)",
  },
};

const LIGHT = {
  bg: "#eef1f5",
  surface: "#ffffff",
  surface2: "#f5f6f8",
  surface3: "#eef0f5",
  border: "#e4e8ee",
  text: "#2c3e50",
  text2: "#6b7480",
  text3: "#98a1ad",
  navBg: "#1c1c2e",
  accentOn: "#ffffff",
  // MapLibre basemap, matched to the web's swapBasemap()
  mapStyle: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  mapLabel: "#3c4663",
  mapLabelHalo: "rgba(255,255,255,0.92)",
};

const DARK = {
  bg: "#0f1218",
  surface: "#171b23",
  surface2: "#1e232d",
  surface3: "#262c38",
  border: "#2b313d",
  text: "#e8ecf2",
  text2: "#a3adba",
  text3: "#737d8b",
  navBg: "#0b0e14",
  accentOn: "#ffffff",
  mapStyle: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  mapLabel: "#c8d0dc",
  mapLabelHalo: "rgba(10,13,18,0.92)",
};

// Status colours — the same greens/reds/ambers the web uses for the
// attendance record, threshold states and warnings.
export const STATUS = {
  good: "#0f7b5f",
  goodSoft: "rgba(15, 123, 95, 0.12)",
  warn: "#b9770e",
  warnSoft: "rgba(224, 122, 45, 0.14)",
  warnStrong: "#c0651f",
  bad: "#c0392b",
  badSoft: "rgba(192, 57, 43, 0.10)",
};

// Compact density scale, same numbers as the web's --gap-*/--radius tokens.
export const SPACE = { gap1: 6, gap2: 10, gap3: 14 };
export const RADIUS = { base: 14, lg: 18, pill: 999 };

// Elevation, approximating --shadow-1/2/3 on both platforms.
export const SHADOW = {
  s1: {
    shadowColor: "#101428",
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  s2: {
    shadowColor: "#101428",
    shadowOpacity: 0.12,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  s3: {
    shadowColor: "#101428",
    shadowOpacity: 0.22,
    shadowRadius: 48,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
};

// The five decorative card gradients stay fixed in both apps — they are a
// palette, not theming, exactly as the stylesheet comment says.
export const CARD_ACCENTS = ["#667eea", "#0d9c8a", "#f5576c", "#e08c1a", "#7b5fd6"];

// The same five as ramps (.card-color-0…4 on the web). Shared rather than
// redeclared per component, so the For You shelf and the list cards below it
// colour the same meeting the same way.
export const CARD_GRADIENTS = [
  ["#667eea", "#764ba2"],
  ["#f093fb", "#f5576c"],
  ["#4facfe", "#00f2fe"],
  ["#43e97b", "#38f9d7"],
  ["#fa709a", "#fee140"],
];

/**
 * Build the palette for a given scheme + accent choice.
 * Screens read `theme.accent`, `theme.surface`, … rather than hex codes.
 */
export function buildTheme(scheme = "light", accentName = "teal") {
  const base = scheme === "dark" ? DARK : LIGHT;
  const accent = ACCENTS[accentName] || ACCENTS.teal;
  return { ...base, ...accent, scheme, accentName, status: STATUS };
}

export const theme = buildTheme();
