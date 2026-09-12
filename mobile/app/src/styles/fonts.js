// Three-font system, mirrored on the web in styles/style.css:
// - Outfit: brand name & headings
// - Inter: body text, inputs, default UI copy
// - Space Grotesk: stats, numbers, buttons (a bit of personality)
export const FONTS = {
  heading: "Outfit_700Bold",
  headingSemi: "Outfit_600SemiBold",
  // The auth screens set font-weight: 800 on the brand and titles; 700 is a
  // visibly lighter stroke at 27px, so that weight is loaded rather than faked.
  headingExtra: "Outfit_800ExtraBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  accent: "SpaceGrotesk_700Bold",
  accentMedium: "SpaceGrotesk_500Medium",
};
