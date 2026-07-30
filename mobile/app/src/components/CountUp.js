import React, { useEffect, useRef, useState } from "react";
import { Text, Easing, Animated } from "react-native";
import { useTheme } from "../context/ThemeContext";

/**
 * A number that counts up to its value instead of appearing at it.
 *
 * Text content cannot be driven natively — there is no animatable "string"
 * property — so this is the one place a JS-driven listener is warranted. It is
 * kept cheap on purpose: a single Animated.Value per number, a short run, and
 * the listener is torn down as soon as it finishes rather than left attached.
 *
 * Small values are not worth animating: counting "0 → 2" reads as a glitch
 * rather than a flourish, so anything under three is written straight out.
 */
export default function CountUp({ value, style, suffix = "", duration = 700, delay = 0 }) {
  const { reduceMotion } = useTheme();
  const target = Number(value) || 0;
  const worthAnimating = !reduceMotion && target >= 3;

  const driver = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(worthAnimating ? 0 : target);

  useEffect(() => {
    if (!worthAnimating) {
      setShown(target);
      return undefined;
    }

    driver.setValue(0);
    const id = driver.addListener(({ value: v }) => setShown(Math.round(v * target)));
    const anim = Animated.timing(driver, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      // Drives a state update, so it cannot go native — see the note above.
      useNativeDriver: false,
    });
    anim.start(() => setShown(target));

    return () => {
      anim.stop();
      driver.removeListener(id);
    };
  }, [target, worthAnimating, driver, duration, delay]);

  return <Text style={style}>{shown}{suffix}</Text>;
}
