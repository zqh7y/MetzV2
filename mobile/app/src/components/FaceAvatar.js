import React from "react";
import Svg, { Circle, Ellipse, Path, Rect, G } from "react-native-svg";

/**
 * Drawn faces, as an alternative to the emoji avatars.
 *
 * Vector rather than images: the same avatar is drawn at 24px in the row of
 * faces on a meeting card and at 108px on a profile hero, and a bitmap that
 * looks right at one of those is wrong at the other. Nothing is downloaded
 * either, so a face appears instantly and works offline.
 *
 * Built from a small set of parts — skin, hair shape, hair colour, a feature —
 * instead of fifteen hand-drawn files. Fifteen separate drawings would drift
 * apart the moment one is touched; assembling them from shared pieces keeps
 * them looking like one family, and adding a sixteenth is a line of data.
 *
 * The first pass came out looking like a school photo. What fixed it was mostly
 * not the hair — it was brows, a smaller mouth, a jaw instead of a circle,
 * shades and headphones in place of round wire specs, and backgrounds with some
 * colour in them. A face with no brows reads as a baby at any size.
 */

// Deliberately wide range: the people using this are not one colour, and a set
// where everyone is the same shade is worse than no set at all.
const SKIN = {
  porcelain: "#f8d9c4", sand: "#f0c49a", honey: "#e0a370",
  amber: "#c8824f", umber: "#9c5f38", espresso: "#6b3f25",
};

// Line work — brows, eyes, the mouth — is this rather than pure black, which
// against the lighter skin tones looks punched out.
const INK = "#241c16";
const DARK = "#17171a";   // shades and headphones

const HAIR = {
  black: "#2b2118", brown: "#6b4429", chestnut: "#8d5524",
  auburn: "#a54e28", blonde: "#cf9a41", ash: "#b9b5ae",
};

// Tops. Only three, and all of them quiet: the shoulders are the bottom
// quarter of the drawing and anything loud there fights the face.
const SHIRT = { charcoal: "#22262f", white: "#eef0f3", denim: "#3f5b8b" };

/**
 * Each entry is one avatar.
 *
 * `bg` carries most of the difference at thumbnail size — at 24px on a meeting
 * card the hair is three pixels and the colour behind it is the whole avatar,
 * so these are saturated rather than tinted.
 */
export const FACES = [
  { id: "face1",  skin: "sand",      hair: "black",    hairStyle: "fade",     feature: "shades",     shirt: "charcoal", bg: "#4f7cf7" },
  { id: "face2",  skin: "porcelain", hair: "blonde",   hairStyle: "long",     feature: null,         shirt: "white",    bg: "#f2994a" },
  { id: "face3",  skin: "amber",     hair: "black",    hairStyle: "curls",    feature: null,         shirt: "denim",    bg: "#2fbf71" },
  { id: "face4",  skin: "honey",     hair: "black",    hairStyle: "fade",     feature: "headphones", shirt: "charcoal", bg: "#ef5d60" },
  { id: "face5",  skin: "espresso",  hair: "black",    hairStyle: "afro",     feature: null,         shirt: "white",    bg: "#f4c542" },
  { id: "face6",  skin: "porcelain", hair: "auburn",   hairStyle: "ponytail", feature: null,         shirt: "denim",    bg: "#6c5ce7" },
  { id: "face7",  skin: "umber",     hair: "black",    hairStyle: "braids",   feature: "earring",    shirt: "charcoal", bg: "#00b8a9" },
  { id: "face8",  skin: "sand",      hair: "brown",    hairStyle: "fade",     feature: "beard",      shirt: "white",    bg: "#ff7a5c" },
  { id: "face9",  skin: "honey",     hair: "black",    hairStyle: "bob",      feature: null,         shirt: "charcoal", bg: "#4b5563" },
  { id: "face10", skin: "amber",     hair: "chestnut", hairStyle: "bun",      feature: "shades",     shirt: "white",    bg: "#e8b021" },
  { id: "face11", skin: "porcelain", hair: "brown",    hairStyle: "bob",      feature: "earring",    shirt: "denim",    bg: "#d9539b" },
  { id: "face12", skin: "espresso",  hair: "ash",      hairStyle: "fade",     feature: "beard",      shirt: "charcoal", bg: "#3aa6e0" },
  { id: "face13", skin: "sand",      hair: "chestnut", hairStyle: "curls",    feature: "headphones", shirt: "white",    bg: "#7c9c3d" },
  { id: "face14", skin: "umber",     hair: "black",    hairStyle: "bun",      feature: null,         shirt: "denim",    bg: "#e2734a" },
  { id: "face15", skin: "honey",     hair: "blonde",   hairStyle: "ponytail", feature: "shades",     shirt: "charcoal", bg: "#5b6ee1" },
];

export const FACE_IDS = FACES.map((f) => f.id);

/** The preset for an id, or null when it is not one of ours. */
export function faceById(id) {
  return FACES.find((f) => f.id === id) || null;
}

/**
 * The part of a hairstyle that belongs *behind* the head.
 *
 * An afro drawn over the face covered the eyes and mouth and rendered as a dark
 * blob with a hint of a face on it. Volume has to sit behind the head and show
 * around the edges; only the hairline sits in front.
 */
function HairBack({ style, color }) {
  switch (style) {
    case "afro":
      return <Circle cx="50" cy="36" r="30" fill={color} />;
    case "long":
      return (
        <Path d="M22 48c0-17 12-27 28-27s28 10 28 27v28c0 4-7 4-7 0V52c-5-7-13-10-21-10s-16 3-21 10v24c0 4-7 4-7 0z" fill={color} />
      );
    case "ponytail":
      return (
        <Path d="M66 36c11 3 16 12 15 23-1 9-7 14-13 13 6-5 9-11 8-19-1-7-5-13-10-17z" fill={color} />
      );
    case "braids":
      return (
        <G>
          <Rect x="20" y="44" width="8" height="32" rx="4" fill={color} />
          <Rect x="72" y="44" width="8" height="32" rx="4" fill={color} />
        </G>
      );
    default:
      return null;
  }
}

function Hair({ style, color }) {
  switch (style) {
    case "long":
      return <Path d="M26 47c0-15 11-24 24-24s24 9 24 24c0-6-2-9-5-11-4-3-11-4-19-4s-15 1-19 4c-3 2-5 5-5 11z" fill={color} />;
    case "bob":
      return (
        <G>
          <Path d="M25 51c0-17 11-28 25-28s25 11 25 28v7c0 3-5 3-5 0v-7c-5-7-12-10-20-10s-15 3-20 10v7c0 3-5 3-5 0z" fill={color} />
          {/* A parting. Without it the shape is a smooth shell and reads as a
              headscarf rather than hair. */}
          <Path d="M50 25c-9 2-15 8-18 17 6-7 12-10 18-11z" fill={color} opacity={0.5} />
        </G>
      );
    case "curls":
      return (
        <G>
          {[[33, 35], [43, 28], [55, 27], [66, 32], [72, 42], [29, 45]].map(([cx, cy], i) => (
            <Circle key={i} cx={cx} cy={cy} r={9.5} fill={color} />
          ))}
        </G>
      );
    case "bun":
      return (
        <G>
          {/* A top knot rather than a low bun — it shows above the head at
              24px, where a bun behind the crown is invisible. */}
          <Circle cx="50" cy="18" r="9" fill={color} />
          <Path d="M26 47c0-15 11-24 24-24s24 9 24 24c0-6-2-9-5-11-4-3-11-4-19-4s-15 1-19 4c-3 2-5 5-5 11z" fill={color} />
        </G>
      );
    case "braids":
    case "ponytail":
      return <Path d="M26 47c0-15 11-24 24-24s24 9 24 24c0-6-2-9-5-11-4-3-11-4-19-4s-15 1-19 4c-3 2-5 5-5 11z" fill={color} />;
    case "afro":
      return null;   // the volume behind the head is the whole style
    case "fade":
    default:
      // A sharp, low hairline with the sides taken in. The soft dome it
      // replaced was the single most school-photo thing in the set.
      return <Path d="M26 47c0-15 11-24 24-24s24 9 24 24c0-6-2-9-5-11-4-3-11-4-19-4s-15 1-19 4c-3 2-5 5-5 11z" fill={color} />;
  }
}

export default function FaceAvatar({ id, size = 48 }) {
  const face = faceById(id) || FACES[0];
  const skin = SKIN[face.skin] || SKIN.sand;
  const hair = HAIR[face.hair] || HAIR.black;
  const shirt = SHIRT[face.shirt] || SHIRT.charcoal;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="50" fill={face.bg} />

      <HairBack style={face.hairStyle} color={hair} />

      {/* Neck first, so the shoulders cover where it meets the top. */}
      <Rect x="43" y="66" width="14" height="14" fill={skin} opacity={0.88} />
      <Path d="M16 100c0-16 15-26 34-26s34 10 34 26z" fill={shirt} />

      {/* A jaw, not a circle. The ellipse it replaced is why every face looked
          like the same cartoon baby. */}
      <Path d="M27 45c0-13 10-22 23-22s23 9 23 22v7c0 15-10 27-23 27s-23-12-23-27z" fill={skin} />
      <Circle cx="26" cy="57" r="5.5" fill={skin} />
      <Circle cx="74" cy="57" r="5.5" fill={skin} />

      <Hair style={face.hairStyle} color={hair} />

      {/* Brows before the eyes, and both before any feature that covers them. */}
      <Path
        d="M34.5 44.2L44 45M65.5 44.2L56 45"
        stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none"
      />
      <Ellipse cx="41" cy="53" rx="3" ry="3.4" fill={INK} />
      <Ellipse cx="59" cy="53" rx="3" ry="3.4" fill={INK} />
      <Path
        d="M50 55v6c0 1 .9 1.7 2.2 1.7"
        stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity={0.35}
      />

      {face.feature === "beard" ? (
        <Path d="M27 54c0 17 10 27 23 27s23-10 23-27c-2 11-11 16-23 16s-21-5-23-16z" fill={hair} />
      ) : null}

      {/* Small, and short of a grin. The wide smiley curve that was here is the
          other half of why these looked like children. */}
      <Path
        d="M44 66.5c2.5 2.4 9.5 2.4 12 0"
        stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none"
      />

      {face.feature === "shades" ? (
        <G>
          <Rect x="29.5" y="46.5" width="18" height="12" rx="4" fill={DARK} />
          <Rect x="52.5" y="46.5" width="18" height="12" rx="4" fill={DARK} />
          <Rect x="47" y="50" width="6" height="2.6" rx="1.3" fill={DARK} />
          <Path
            d="M29.5 49l-5-1.6M70.5 49l5-1.6"
            stroke={DARK} strokeWidth="2.6" strokeLinecap="round" fill="none"
          />
          {/* The glint is what makes them read as glass rather than as two
              black rectangles. */}
          <Path
            d="M33.5 56l6-7.5"
            stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity={0.32}
          />
        </G>
      ) : null}

      {face.feature === "headphones" ? (
        <G>
          <Path d="M23 50a27 27 0 0 1 54 0" stroke={DARK} strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <Rect x="15.5" y="47" width="12" height="18" rx="6" fill={DARK} />
          <Rect x="72.5" y="47" width="12" height="18" rx="6" fill={DARK} />
        </G>
      ) : null}

      {face.feature === "earring" ? (
        <Circle cx="74" cy="63.5" r="3" fill="#f4c542" />
      ) : null}
    </Svg>
  );
}
