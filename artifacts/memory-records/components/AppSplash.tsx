import React, { useEffect, useRef } from "react";
import { Animated, Image, StyleSheet, Text, View } from "react-native";

interface AppSplashProps {
  onDone: () => void;
}

const ICON = require("@/assets/images/memory-records_icon.jpg");

const FADE_IN_MS  = 600;
const HOLD_MS     = 1800;
const FADE_OUT_MS = 600;

export function AppSplash({ onDone }: AppSplashProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }),
      Animated.delay(HOLD_MS),
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }),
    ]).start(() => onDone());
  }, [opacity, onDone]);

  return (
    <View style={s.container}>
      <Animated.View style={[s.inner, { opacity }]}>
        <Image source={ICON} style={s.icon} resizeMode="cover" />
        <Text style={s.title}>Memory Records</Text>
        <Text style={s.subtitle}>Your memories, your device</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f0f1a",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  inner: {
    alignItems: "center",
    gap: 20,
  },
  icon: {
    width: 120,
    height: 120,
    borderRadius: 28,
  },
  title: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: "#ffffff",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.45)",
    letterSpacing: 0.2,
  },
});
