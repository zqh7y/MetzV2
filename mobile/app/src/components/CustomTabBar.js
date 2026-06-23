import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const ICONS = {
  Home: { active: "🏠", inactive: "🏠" },
  Discover: { active: "🧭", inactive: "🧭" },
  Create: { active: "➕", inactive: "➕" },
  Joined: { active: "🤝", inactive: "🤝" },
  Profile: { active: "👤", inactive: "👤" },
};

const LABELS = {
  Home: "Home",
  Discover: "Discover",
  Create: "Create",
  Joined: "Joined",
  Profile: "Profile",
};

function TabButton({ route, isFocused, onPress }) {
  const lift = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(lift, { toValue: isFocused ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [isFocused]);

  const translateY = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

  return (
    <Pressable onPress={onPress} style={styles.tabBtn} android_ripple={{ color: "#eee", radius: 38 }}>
      <Animated.View style={{ alignItems: "center", transform: [{ translateY }] }}>
        <Text style={[styles.icon, { opacity: isFocused ? 1 : 0.45 }]}>{ICONS[route.name].active}</Text>
        <Text style={[styles.label, isFocused && styles.labelActive]}>{LABELS[route.name]}</Text>
        <View style={[styles.dot, { opacity: isFocused ? 1 : 0 }]} />
      </Animated.View>
    </Pressable>
  );
}

export default function CustomTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;

        function onPress() {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        }

        return <TabButton key={route.key} route={route} isFocused={isFocused} onPress={onPress} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eef0f3",
    paddingTop: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  tabBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  icon: { fontSize: 20, marginBottom: 3 },
  label: { fontSize: 11, fontWeight: "600", color: "#9aa3ad" },
  labelActive: { color: "#667eea", fontWeight: "700" },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#667eea", marginTop: 4 },
});
