import React from "react";
import Svg, { Circle, ClipPath, Defs, G } from "react-native-svg";

// The logo, drawn rather than shipped as a bitmap so it stays sharp at any size
// and follows the active accent instead of being frozen teal.
//
// Two circles overlapping by one radius — two people's plans meeting, which is
// the app in one shape. The lens where they cross is knocked out to the page
// colour rather than painted a darker accent: one colour plus the background is
// the only version that survives at launcher sizes, and it keeps this identical
// to assets/icon.png (see tools/make_icons.py, which draws the same geometry).
//
// `bg` must be the surface the mark sits on. A transparent lens would be wrong
// here — the auth card is --bg, not white, so a hole would show the wrong shade.
export default function BrandMark({ size = 40, color, bg = "#ffffff" }) {
  // viewBox 30x20: radius 10, centres one radius apart at x=10 and x=20, so the
  // union spans the full width with no arbitrary padding to keep in sync.
  return (
    <Svg viewBox="0 0 30 20" width={size} height={(size / 3) * 2}>
      <Defs>
        <ClipPath id="brandLeft">
          <Circle cx="10" cy="10" r="10" />
        </ClipPath>
      </Defs>
      <Circle cx="10" cy="10" r="10" fill={color} />
      <Circle cx="20" cy="10" r="10" fill={color} />
      {/* The right circle clipped to the left one is exactly the lens. */}
      <G clipPath="url(#brandLeft)">
        <Circle cx="20" cy="10" r="10" fill={bg} />
      </G>
    </Svg>
  );
}
