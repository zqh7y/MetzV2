import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import FaceAvatar from "./FaceAvatar";
import { frameFor } from "../styles/profileLooks";
import { FONTS } from "../styles/fonts";

/**
 * The avatar with whatever frame its owner chose.
 *
 * One component because the same avatar appears on your own profile, on other
 * people's, and in the welcome flow's live preview. Three copies of the ring
 * maths is how they drift apart, and a frame that renders differently depending
 * on which screen you are looking at reads as a bug.
 *
 * The frame is drawn as a gradient ring *behind* a slightly smaller circle
 * rather than as a border, because React Native cannot put a gradient on a
 * border and a flat one would waste most of the palettes.
 */
export default function ProfileAvatar({
  size = 108, frame = "none", emoji, face, initials, color, style,
}) {
  const look = frameFor(frame);
  const ring = look.width;
  const inner = size - ring * 2;

  const circle = (
    <View
      style={[
        styles.face,
        {
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: face ? "transparent" : (color || "rgba(255,255,255,0.22)"),
        },
        // A dashed frame is the one look the gradient ring cannot express, so
        // it falls back to a real border on the face itself.
        look.dashed && { borderWidth: 2, borderColor: "#fff", borderStyle: "dashed" },
      ]}
    >
      {/* A drawn face fills the circle, so it wins over both the emoji and the
          initials — the three are alternatives, not layers. */}
      {face ? (
        <FaceAvatar id={face} size={inner} />
      ) : (
        <Text style={emoji ? [styles.text, { fontSize: inner * 0.46 }] : [styles.text, { fontSize: inner * 0.34 }]}>
          {emoji || initials || "?"}
        </Text>
      )}
    </View>
  );

  if (!ring) {
    return <View style={style}>{circle}</View>;
  }

  return (
    <LinearGradient
      colors={look.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.ring,
        { width: size, height: size, borderRadius: size / 2, padding: ring },
        style,
      ]}
    >
      {circle}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: "center", justifyContent: "center" },
  face: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  text: { color: "#fff", fontFamily: FONTS.accent },
});
