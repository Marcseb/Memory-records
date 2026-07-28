import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { MemoryRecord } from "@/context/RecordsContext";
import { useColors } from "@/hooks/useColors";
import { getEmotion } from "@/constants/emotions";

interface Props {
  record: MemoryRecord;
  onPress: () => void;
  onDelete: () => void;
  onAddPhoto?: () => void;
  /** 1-based display position within this year group (Date sort mode only) */
  yearRank?: number;
  /** Total records in this year group */
  yearTotal?: number;
  /** Move up within year — undefined means cannot move up */
  onMoveUp?: () => void;
  /** Move down within year — undefined means cannot move down */
  onMoveDown?: () => void;
}

export function RecordCard({
  record,
  onPress,
  onDelete,
  onAddPhoto,
  yearRank,
  yearTotal,
  onMoveUp,
  onMoveDown,
}: Props) {
  const colors = useColors();
  const scale = useSharedValue(1);
  const reorderMode = yearRank !== undefined;

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

  const handleMoveUp = async () => {
    if (!onMoveUp) return;
    if (Platform.OS !== "web") await Haptics.selectionAsync();
    onMoveUp();
  };

  const handleMoveDown = async () => {
    if (!onMoveDown) return;
    if (Platform.OS !== "web") await Haptics.selectionAsync();
    onMoveDown();
  };

  const emotion = getEmotion(record.emotion);
  const showEmotion = emotion.key !== "neutral";

  const isHistorical = !!record.isHistoricalEvent;

  const s = StyleSheet.create({
    card: {
      backgroundColor: isHistorical ? colors.historical : colors.card,
      borderRadius: colors.radius,
      marginHorizontal: 16,
      marginVertical: 6,
      flexDirection: "row",
      overflow: "hidden",
      borderWidth: isHistorical ? 1.5 : 1,
      borderColor: isHistorical ? colors.historicalBorder : colors.border,
      shadowColor: isHistorical ? colors.historicalBorder : "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isHistorical ? 0.18 : 0.06,
      shadowRadius: 8,
      elevation: isHistorical ? 3 : 2,
    },
    pressableArea: {
      flex: 1,
      flexDirection: "row",
    },
    thumbnail: {
      width: 88,
      height: 88,
    },
    noPhotoThumb: {
      width: 88,
      height: 88,
      backgroundColor: isHistorical ? colors.historicalBorder + "22" : colors.surface,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    noPhotoHint: {
      fontSize: 9,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 4,
    },
    content: {
      flex: 1,
      padding: 12,
      gap: 4,
    },
    date: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: isHistorical ? colors.historicalForeground : colors.primary,
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
      flexWrap: "wrap",
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
    emotionDot: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderRadius: 10,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    emotionDotText: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
    },
    // Standard delete button (non-reorder mode)
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
    historicalStripe: {
      width: 4,
      backgroundColor: colors.historicalBorder,
    },
    // Reorder mode right column
    reorderCol: {
      width: 38,
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 8,
      backgroundColor: colors.surface,
    },
    reorderDeleteBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.destructive + "15",
      alignItems: "center",
      justifyContent: "center",
    },
    reorderMoveBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.primary + "15",
      alignItems: "center",
      justifyContent: "center",
    },
    reorderMoveBtnDisabled: {
      backgroundColor: "transparent",
    },
  });

  const notePreview = record.note
    ? record.note.length > 80
      ? record.note.substring(0, 77) + "..."
      : record.note
    : "No note added";

  return (
    <Animated.View style={[s.card, animatedStyle]}>
      {/* Amber accent stripe for historical events */}
      {isHistorical && <View style={s.historicalStripe} />}

      {/* Tappable area — thumbnail + content */}
      <Pressable
        style={s.pressableArea}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {record.imageUri ? (
          <Image source={{ uri: record.imageUri }} style={s.thumbnail} contentFit="cover" />
        ) : (
          <Pressable style={s.noPhotoThumb} onPress={isHistorical ? undefined : onAddPhoto} hitSlop={4}>
            <Feather
              name={isHistorical ? (record.eventScope === "international" ? "globe" : "flag") : "camera"}
              size={22}
              color={isHistorical ? colors.historicalForeground : onAddPhoto ? colors.primary : colors.mutedForeground}
            />
            {!isHistorical && onAddPhoto && <Text style={s.noPhotoHint}>Add photo</Text>}
            {isHistorical && (
              <Text style={[s.noPhotoHint, { color: colors.historicalForeground }]}>
                {record.eventScope === "international" ? "World" : "National"}
              </Text>
            )}
          </Pressable>
        )}
        <View style={s.content}>
          <Text style={s.date}>
            {record.date}
            {record.contextYear !== undefined ? (
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                {"  ·  "}{record.contextYear}
              </Text>
            ) : null}
            {reorderMode && yearTotal !== undefined ? (
              <Text style={{ fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                {"  ·  "}{yearRank}/{yearTotal}
              </Text>
            ) : null}
          </Text>
          <Text style={s.note} numberOfLines={2}>{notePreview}</Text>
          <View style={s.meta}>
            {record.tags && record.tags.length > 0
              ? record.tags.slice(0, 2).map((tag) => (
                  <View key={tag} style={[s.badge, { backgroundColor: colors.primary + "18" }]}>
                    <Text style={[s.badgeText, { color: colors.primary }]}>#{tag}</Text>
                  </View>
                ))
              : null}
            {record.tags && record.tags.length > 2 ? (
              <Text style={[s.badgeText, { color: colors.mutedForeground }]}>+{record.tags.length - 2}</Text>
            ) : null}
            {showEmotion && (
              <View style={[s.emotionDot, { backgroundColor: emotion.color + "22" }]}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: emotion.color }} />
                <Text style={[s.emotionDotText, { color: emotion.color }]}>{emotion.label}</Text>
              </View>
            )}
            {record.location ? (
              <>
                <Feather name="map-pin" size={11} color={colors.mutedForeground} />
                <Text style={s.metaText} numberOfLines={1}>{record.location}</Text>
              </>
            ) : null}
            {isHistorical ? (
              <View style={[s.badge, { backgroundColor: colors.historicalBorder + "22" }]}>
                <Text style={[s.badgeText, { color: colors.historicalForeground }]}>
                  {record.eventScope === "international" ? "🌐 World" : "🏛️ National"}
                </Text>
              </View>
            ) : null}
            {record.savedToObsidian ? (
              <View style={s.badge}>
                <Text style={s.badgeText}>Obsidian</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>

      {/* Right side: reorder column (date sort mode) OR standard delete button */}
      {reorderMode ? (
        <View style={s.reorderCol}>
          <Pressable style={s.reorderDeleteBtn} onPress={handleDelete} hitSlop={6}>
            <Feather name="trash-2" size={12} color={colors.destructive} />
          </Pressable>
          <Pressable
            style={[s.reorderMoveBtn, !onMoveUp && s.reorderMoveBtnDisabled]}
            onPress={handleMoveUp}
            disabled={!onMoveUp}
            hitSlop={4}
          >
            <Feather
              name="chevron-up"
              size={18}
              color={onMoveUp ? colors.primary : colors.mutedForeground + "40"}
            />
          </Pressable>
          <Pressable
            style={[s.reorderMoveBtn, !onMoveDown && s.reorderMoveBtnDisabled]}
            onPress={handleMoveDown}
            disabled={!onMoveDown}
            hitSlop={4}
          >
            <Feather
              name="chevron-down"
              size={18}
              color={onMoveDown ? colors.primary : colors.mutedForeground + "40"}
            />
          </Pressable>
        </View>
      ) : (
        <Pressable style={s.deleteBtn} onPress={handleDelete} hitSlop={8}>
          <Feather name="trash-2" size={13} color={colors.destructive} />
        </Pressable>
      )}
    </Animated.View>
  );
}
