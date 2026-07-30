import React, { useMemo } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { FONTS } from "../styles/fonts";

/**
 * The overlapping row of who has joined — the web's `.joined-avatars`.
 *
 * The API has been sending `joined_preview` (a colour, an initial and a picture
 * per person) all along and the card was reducing it to the words "9 joined".
 * Faces say the same thing in less room and make a busy meeting look busy,
 * which a number never quite does.
 *
 * Four at most, then a "+N" chip — the same cut the web makes, so a popular
 * meeting doesn't push the Join button off the row.
 */
const SHOWN = 4;

export default function AvatarStack({ people = [], total = 0, size = 24 }) {
  const { theme } = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const shown = people.slice(0, SHOWN);
  if (!shown.length) return null;

  const extra = Math.max(0, (total || people.length) - shown.length);
  const dim = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={styles.row}>
      {shown.map((p, i) => (
        <View
          key={p.uid || i}
          style={[
            styles.avatar,
            dim,
            // The first one sits flush; the rest tuck under their neighbour.
            i === 0 && { marginLeft: 0 },
            !p.profile_picture && { backgroundColor: p.color || theme.accent },
          ]}
        >
          {p.profile_picture ? (
            <Image source={{ uri: p.profile_picture }} style={[dim, styles.photo]} />
          ) : (
            <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{p.initial || "?"}</Text>
          )}
        </View>
      ))}

      {extra > 0 ? (
        <View style={[styles.avatar, styles.more, dim]}>
          <Text style={[styles.moreText, { fontSize: size * 0.38 }]}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (t) => StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  avatar: {
    marginLeft: -8,
    borderWidth: 2,
    // Matches the card it sits on, so the overlap reads as a cut-out.
    borderColor: t.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photo: { resizeMode: "cover" },
  initial: { color: "#fff", fontFamily: FONTS.accent },
  more: { backgroundColor: t.surface3 },
  moreText: { color: t.accentStrong, fontFamily: FONTS.accent },
});
