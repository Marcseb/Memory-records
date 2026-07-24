import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { EMOTIONS, getEmotion } from "@/constants/emotions";
import { useColors } from "@/hooks/useColors";

interface EmotionPickerProps {
  value: string;
  onChange: (key: string) => void;
}

const BASIC    = EMOTIONS.filter((e) => e.group === "basic" || e.group === "neutral");
const COMPLEX  = EMOTIONS.filter((e) => e.group === "complex");

export function EmotionPicker({ value, onChange }: EmotionPickerProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const emotion = getEmotion(value);

  const handleSelect = (key: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    onChange(key);
    setOpen(false);
  };

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: colors.surface,
          borderRadius: colors.radius,
          borderWidth: 1,
          borderColor: open ? emotion.color : colors.border,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: emotion.color }} />
        <Text style={{ flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground }}>
          {emotion.label}
        </Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={15} color={colors.mutedForeground} />
      </Pressable>

      {open && (
        <View
          style={{
            backgroundColor: colors.card,
            borderRadius: colors.radius,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 12,
            gap: 12,
          }}
        >
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Basic
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {BASIC.map((e) => {
                  const active = value === e.key;
                  return (
                    <Pressable
                      key={e.key}
                      onPress={() => handleSelect(e.key)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 16,
                        backgroundColor: active ? e.color + "28" : colors.surface,
                        borderWidth: 1.5,
                        borderColor: active ? e.color : colors.border,
                      }}
                    >
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: e.color }} />
                      <Text style={{ fontSize: 13, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular", color: active ? e.color : colors.foreground }}>
                        {e.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 10, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Complex
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {COMPLEX.map((e) => {
                const active = value === e.key;
                return (
                  <Pressable
                    key={e.key}
                    onPress={() => handleSelect(e.key)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: active ? e.color + "28" : colors.surface,
                      borderWidth: 1.5,
                      borderColor: active ? e.color : colors.border,
                    }}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: e.color }} />
                    <Text style={{ fontSize: 13, fontFamily: active ? "Inter_600SemiBold" : "Inter_400Regular", color: active ? e.color : colors.foreground }}>
                      {e.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
