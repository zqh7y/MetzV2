import React, { useRef } from "react";
import { Animated, Pressable } from "react-native";

// Subtle scale-down-on-press feedback, used for buttons across the app.
export default function AnimatedPressable({ style, children, onPress, disabled, scaleTo = 0.96 }) {
  const scale = useRef(new Animated.Value(1)).current;

  function animateTo(value) {
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animateTo(scaleTo)}
      onPressOut={() => animateTo(1)}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
