import React, { useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { useTheme } from "../context/ThemeContext";

/**
 * Fade-and-rise entrance for a block of content.
 *
 * Everything runs on the native driver — opacity and transform only — so the
 * animation lives on the UI thread and keeps going even while JavaScript is
 * busy fetching or filtering. Anything that would animate layout (height,
 * margin) is deliberately absent, since that has to round-trip through the
 * shadow tree every frame and is exactly how "animated" turns into "slow".
 *
 * Honours the motion preference: with `motion: reduced` the content is simply
 * there, at full opacity, with no timer started at all.
 */
export default function Appear({ children, delay = 0, offset = 12, duration = 320, style }) {
  const { reduceMotion } = useTheme();
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
    // Runs once per mount: this is an entrance, not a state animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
