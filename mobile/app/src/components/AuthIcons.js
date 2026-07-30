import React from "react";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

// The four inline SVGs from templates/login.html, templates/signup.html and
// templates/auth_base.html, transcribed path for path so the two apps draw the
// same glyphs rather than approximations. Every one keeps its source viewBox,
// stroke width and cap/join, which is what makes them line up at any size.

export function MailIcon({ size = 18, color }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color}
         strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="2" y="4" width="20" height="16" rx="3" />
      <Path d="m2 7 10 6 10-6" />
    </Svg>
  );
}

export function LockIcon({ size = 18, color }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color}
         strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="4" y="10" width="16" height="11" rx="2.5" />
      <Path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

// The web keeps one eye for both states and only flips aria-label/aria-pressed,
// so there is deliberately no crossed-out variant here.
export function EyeIcon({ size = 18, color }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color}
         strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <Circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function AlertIcon({ size = 17, color }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color}
         strokeWidth={2.2} strokeLinecap="round">
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="8" x2="12" y2="12.5" />
      <Line x1="12" y1="16.5" x2="12.01" y2="16.5" />
    </Svg>
  );
}
