import React, { useEffect, useMemo, useRef } from "react";
import { View, Animated, StyleSheet, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useTheme } from "../context/ThemeContext";

/**
 * The profile hero's background: the chosen colours drifting from the top-left
 * corner towards the bottom-right, for ever.
 *
 * Two things make it work.
 *
 * The gradient is drawn at twice the box in each direction and the *sheet* is
 * translated, rather than the gradient's own start/end points being animated.
 * `start` and `end` are layout props on LinearGradient — moving them re-lays
 * out and re-rasterises the gradient on every frame, on the JS thread. A
 * transform is the one thing the native driver can animate off-thread, so this
 * costs nothing per frame once it has started.
 *
 * The colour list is the pattern repeated twice, and the sheet travels exactly
 * one repeat before snapping back. The frame it resets on is identical to the
 * frame it started on, so the loop has no visible seam — which is the whole
 * difference between "drifting" and "sliding back every few seconds".
 */

/** "#38bdf8" -> "rgba(56,189,248,0.5)". Falls back to the input untouched. */
function withAlpha(color, alpha) {
  const hex = String(color || "").trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(hex) || /^#?([0-9a-f]{3})$/i.exec(hex);
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default function AnimatedBackdrop({
  colors, style, children, duration = 8000, ...rest
}) {
  const { reduceMotion } = useTheme();
  const shift = useRef(new Animated.Value(0)).current;
  // Measured rather than assumed: the hero is as wide as the screen on one
  // page and a small preview tile on another, and a fixed travel distance
  // would crawl on one and race on the other.
  const [box, setBox] = React.useState({ width: 0, height: 0 });

  const [a, b] = colors && colors.length >= 2 ? colors : ["#667eea", "#667eea"];

  // Each colour, then the same colour at half opacity — the pattern the owner
  // asked for — listed twice so the sheet can loop through one full repeat.
  const stops = useMemo(
    () => [a, withAlpha(b, 0.5), a, withAlpha(b, 0.5)],
    [a, b]
  );

  useEffect(() => {
    if (reduceMotion || !box.width) {
      shift.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(shift, {
        toValue: 1,
        duration,
        // Linear on purpose: any easing makes a continuous drift visibly
        // hesitate at the point where the loop restarts.
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [shift, reduceMotion, duration, box.width, box.height]);

  // Travels one repeat of the pattern: half of the doubled sheet.
  const travel = (v) => shift.interpolate({ inputRange: [0, 1], outputRange: [-v, 0] });

  return (
    <View
      style={[styles.clip, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== box.width || height !== box.height) setBox({ width, height });
      }}
      {...rest}
    >
      {box.width ? (
        <Animated.View
          pointerEvents="none"
          // Anchored with left/top and sized explicitly, NOT absoluteFill.
          // absoluteFill pins all four edges, and a box pinned left *and*
          // right cannot also be twice as wide — the width was dropped, the
          // sheet came out exactly box-sized, and every pixel it drifted left
          // uncovered bare background on the right. That was invisible at rest
          // and obvious the moment it moved.
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: box.width * 2,
            height: box.height * 2,
            transform: [
              { translateX: travel(box.width) },
              { translateY: travel(box.height) },
            ],
          }}
        >
          <LinearGradient
            colors={stops}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : (
        // Painted flat for the first frame, before onLayout has reported a
        // size — otherwise the hero flashes the page background behind it.
        <LinearGradient
          colors={[a, withAlpha(b, 0.5)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // The sheet is deliberately larger than the box; without this it would show.
  clip: { overflow: "hidden" },
});
