import React from "react";
import Svg, { Circle, Path, Polyline, Rect } from "react-native-svg";

/**
 * Stroke icons for the drawer and its nav rows.
 *
 * These replace the emoji the drawer used to render. Emoji are drawn by the
 * system font, so they arrive in someone else's colours and someone else's
 * weight — a red toolbox and a yellow house next to a teal accent, at whatever
 * size the vendor decided. Stroked paths take `color` from the row, so an
 * active item tints its icon along with its label, and every glyph shares one
 * weight instead of five illustration styles.
 *
 * Geometry follows the same 24-unit box and 1.9 stroke as AuthIcons, so the
 * two sets sit together without looking borrowed from different libraries.
 */
function Icon({ size = 20, color, children }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color}
         strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export const HomeIcon = (p) => (
  <Icon {...p}>
    <Path d="M3 10.5 12 3l9 7.5" />
    <Path d="M5.5 9.5V20a1 1 0 0 0 1 1H9.5v-5.5h5V21h3a1 1 0 0 0 1-1V9.5" />
  </Icon>
);

export const PlusIcon = (p) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 8.5v7M8.5 12h7" />
  </Icon>
);

export const UserIcon = (p) => (
  <Icon {...p}>
    <Circle cx="12" cy="8.5" r="3.5" />
    <Path d="M5 20c0-3.4 3.1-5.5 7-5.5s7 2.1 7 5.5" />
  </Icon>
);

export const PencilIcon = (p) => (
  <Icon {...p}>
    <Path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <Path d="M14.5 7.5 17 10" />
  </Icon>
);

// A hub with straight radial spokes reads as a sun, not a cog — the teeth have
// to be blunt tabs around the rim for it to say "settings" at 20px.
export const GearIcon = (p) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="3.1" />
    <Path d="M12 1.9l1.5 2.2a8.2 8.2 0 0 1 1.9.8l2.6-.4 1.5 2.6-1.6 2.1c.1.35.15.7.15 1.05s-.05.7-.15 1.05l1.6 2.1-1.5 2.6-2.6-.4a8.2 8.2 0 0 1-1.9.8L12 22.1l-1.5-2.2a8.2 8.2 0 0 1-1.9-.8l-2.6.4-1.5-2.6 1.6-2.1A5.9 5.9 0 0 1 6 12c0-.35.05-.7.15-1.05L4.55 8.85l1.5-2.6 2.6.4a8.2 8.2 0 0 1 1.9-.8L12 1.9Z" />
  </Icon>
);

export const ToolsIcon = (p) => (
  <Icon {...p}>
    <Path d="M14.2 6.4a3.6 3.6 0 0 0 4.8 4.6l2.2 2.2a1.6 1.6 0 0 1-2.2 2.2l-2.3-2.3" />
    <Path d="M9.8 13.2 4.3 18.7a1.8 1.8 0 0 0 2.5 2.5l5.5-5.5" />
    <Path d="M16.6 8.8 8.2 17.2" />
    <Path d="M3 5.5 5.5 3l4 4-2.5 2.5-4-4Z" />
  </Icon>
);

export const ClockIcon = (p) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Polyline points="12 7 12 12 15.5 14" />
  </Icon>
);

export const LogOutIcon = (p) => (
  <Icon {...p}>
    <Path d="M15 21H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h9" />
    <Polyline points="12 8 16 12 12 16" />
    <Path d="M16 12H9" />
  </Icon>
);

export const CloseIcon = (p) => (
  <Icon {...p}>
    <Path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
  </Icon>
);

export const SearchIcon = (p) => (
  <Icon {...p}>
    <Circle cx="11" cy="11" r="6.5" />
    <Path d="m16 16 4.5 4.5" />
  </Icon>
);

export const MapPinIcon = (p) => (
  <Icon {...p}>
    <Path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z" />
    <Circle cx="12" cy="10" r="2.6" />
  </Icon>
);

export const GlobeIcon = (p) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M3.2 9.5h17.6M3.2 14.5h17.6" />
    <Path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
  </Icon>
);

// The calendar from the web's .create-header-icon, plus a plus-mark.
export const CalendarPlusIcon = (p) => (
  <Icon {...p}>
    <Rect x="3" y="4.5" width="18" height="17" rx="2.5" />
    <Path d="M8 2.5v4M16 2.5v4M3 10h18" />
    <Path d="M12 13.5v5M9.5 16h5" />
  </Icon>
);

export const CalendarIcon = (p) => (
  <Icon {...p}>
    <Rect x="3" y="4.5" width="18" height="17" rx="2.5" />
    <Path d="M8 2.5v4M16 2.5v4M3 10h18" />
  </Icon>
);

export const TagIcon = (p) => (
  <Icon {...p}>
    <Path d="M12.6 3H20a1 1 0 0 1 1 1v7.4a1 1 0 0 1-.3.7l-8.6 8.6a1 1 0 0 1-1.4 0l-7.4-7.4a1 1 0 0 1 0-1.4l8.6-8.6a1 1 0 0 1 .7-.3Z" />
    <Circle cx="16.5" cy="7.5" r="1.4" />
  </Icon>
);

export const UsersIcon = (p) => (
  <Icon {...p}>
    <Circle cx="9" cy="8" r="3.2" />
    <Path d="M2.5 20c0-3.3 2.9-5.3 6.5-5.3s6.5 2 6.5 5.3" />
    <Path d="M16 5.4a3.2 3.2 0 0 1 0 5.2M18 14.9c2.1.6 3.5 2.1 3.5 4.3" />
  </Icon>
);

export const FlagIcon = (p) => (
  <Icon {...p}>
    <Path d="M5.5 21V3.6c3.5-1.6 6.5 1.6 10 0v9.6c-3.5 1.6-6.5-1.6-10 0" />
  </Icon>
);

export const CompassIcon = (p) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="m15.2 8.8-2 4.4-4.4 2 2-4.4 4.4-2Z" />
  </Icon>
);

export const BellIcon = (p) => (
  <Icon {...p}>
    <Path d="M18 15.5V11a6 6 0 1 0-12 0v4.5L4.5 18h15L18 15.5Z" />
    <Path d="M9.8 21a2.4 2.4 0 0 0 4.4 0" />
  </Icon>
);

export const SparkleIcon = (p) => (
  <Icon {...p}>
    <Path d="M12 3.5 13.8 9 19.5 10.8 13.8 12.6 12 18.1 10.2 12.6 4.5 10.8 10.2 9 12 3.5Z" />
  </Icon>
);
