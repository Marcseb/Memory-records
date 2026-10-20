import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

export default function MapScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={[styles.icon, { backgroundColor: colors.primary + "18" }]}>
        <Feather name="map" size={28} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Map temporarily unavailable
      </Text>
      <Text style={[styles.message, { color: colors.mutedForeground }]}>
        The map is disabled while we investigate a crash. GPS coordinates in
        your memories are kept and can still be saved.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  icon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 32,
  },
  title: {
    marginTop: 18,
    fontFamily: "Inter_600SemiBold",
    fontSize: 19,
    textAlign: "center",
  },
  message: {
    marginTop: 8,
    maxWidth: 300,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});
