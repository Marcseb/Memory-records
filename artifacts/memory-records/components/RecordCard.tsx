import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { MemoryRecord } from "@/context/RecordsContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  record: MemoryRecord;
  onPress: () => void;
  onDelete: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function RecordCard({ record, onPress, onDelete }: Props) {
  const colors = useColors();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
  };

  const handlePress = async () => {
    if (Platform.OS !== "web") await Haptics.selectionAsync();
    onPress();
  };

  const handleDelete = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete();
  };

  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      marginHorizontal: 16,
      marginVertical: 6,
      flexDirection: "row",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    thumbnail: {
      width: 88,
      height: 88,
    },
    content: {
      flex: 1,
      padding: 12,
      gap: 4,
    },
    date: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    note: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 20,
    },
    meta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 2,
    },
    metaText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    badge: {
      backgroundColor: colors.success + "22",
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeText: {
      fontSize: 10,
      fontFamily: "Inter_600SemiBold",
      color: colors.success,
    },
    deleteBtn: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.destructive + "15",
      alignItems: "center",
      justifyContent: "center",
    },
  });

  const notePreview = record.note
    ? record.note.length > 80
      ? record.note.substring(0, 77) + "..."
      : record.note
    : "No note added";

  return (
    <AnimatedPressable
      style={[s.card, animatedStyle]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Image source={{ uri: record.imageUri }} style={s.thumbnail} contentFit="cover" />
      <View style={s.content}>
        <Text style={s.date}>{record.date}</Text>
        <Text style={s.note} numberOfLines={2}>{notePreview}</Text>
        <View style={s.meta}>
          {record.location ? (
            <>
              <Feather name="map-pin" size={11} color={colors.mutedForeground} />
              <Text style={s.metaText} numberOfLines={1}>{record.location}</Text>
            </>
          ) : null}
          {record.savedToObsidian ? (
            <View style={s.badge}>
              <Text style={s.badgeText}>Obsidian</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Pressable style={s.deleteBtn} onPress={handleDelete} hitSlop={8}>
        <Feather name="trash-2" size={13} color={colors.destructive} />
      </Pressable>
    </AnimatedPressable>
  );
}
