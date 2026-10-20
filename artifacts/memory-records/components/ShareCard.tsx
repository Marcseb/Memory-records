import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { ComponentProps, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { getEmotion } from "@/constants/emotions";
import { MemoryRecord } from "@/context/RecordsContext";
import { useColors } from "@/hooks/useColors";

const CARD_WIDTH = 360;
const CARD_HEIGHT = 450;

type FeatherName = ComponentProps<typeof Feather>["name"];

const EMOTION_ICONS: Record<string, FeatherName> = {
  neutral: "book-open",
  happiness: "smile",
  sadness: "cloud",
  anger: "zap",
  fear: "shield",
  surprise: "sunrise",
  disgust: "x-circle",
  love: "heart",
  guilt: "alert-circle",
  shame: "eye-off",
  pride: "award",
  jealousy: "target",
  envy: "trending-up",
  gratitude: "gift",
  hope: "sunrise",
  anxiety: "activity",
  embarrassment: "eye",
  loneliness: "user",
  nostalgia: "clock",
  excitement: "star",
  contempt: "minus-circle",
  confusion: "help-circle",
};

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function excerptFor(note: string): string {
  const compact = note.trim().replace(/\s+/g, " ");
  const characters = Array.from(compact);
  if (characters.length <= 100) return compact;
  return `${characters.slice(0, 97).join("").trimEnd()}…`;
}

interface Props {
  record: MemoryRecord;
}

export const SHARE_CARD_WIDTH = CARD_WIDTH;
export const SHARE_CARD_HEIGHT = CARD_HEIGHT;

export function ShareCard({ record }: Props) {
  const colors = useColors();
  const emotion = getEmotion(record.emotion);
  const [failedImageUri, setFailedImageUri] = useState<string | undefined>();
  const hasPhoto = !!record.imageUri && failedImageUri !== record.imageUri;
  const emotionIcon = EMOTION_ICONS[emotion.key] ?? "book-open";
  const excerpt = excerptFor(record.note) || "A moment worth remembering.";

  const styles = StyleSheet.create({
    card: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      padding: 22,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      justifyContent: "space-between",
      overflow: "hidden",
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    brandMark: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary + "18",
    },
    brandName: {
      fontSize: 13,
      fontFamily: "Inter_700Bold",
      letterSpacing: 1.2,
      color: colors.foreground,
    },
    brandSubtitle: {
      marginTop: 2,
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    hero: {
      height: 232,
      width: "100%",
      borderRadius: 20,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    heroImage: {
      ...StyleSheet.absoluteFill,
    },
    emotionFallback: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    emotionIconCircle: {
      width: 104,
      height: 104,
      borderRadius: 52,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    emotionLabel: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    photoEmotionBadge: {
      position: "absolute",
      top: 12,
      right: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 18,
      backgroundColor: colors.card + "E8",
    },
    photoEmotionLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    noteBlock: {
      gap: 8,
      minHeight: 72,
      justifyContent: "center",
    },
    noteEyebrow: {
      fontSize: 9,
      fontFamily: "Inter_700Bold",
      letterSpacing: 1.4,
      color: colors.primary,
      textTransform: "uppercase",
    },
    note: {
      fontSize: 18,
      lineHeight: 25,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    dateLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    footerMark: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
  });

  return (
    <View style={styles.card} collapsable={false}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Feather name="book-open" size={18} color={colors.primary} />
        </View>
        <View>
          <Text style={styles.brandName}>MEMORY RECORDS</Text>
          <Text style={styles.brandSubtitle}>A moment worth keeping</Text>
        </View>
      </View>

      <View style={styles.hero}>
        {hasPhoto ? (
          <Image
            source={{ uri: record.imageUri! }}
            style={styles.heroImage}
            contentFit="cover"
            onError={() => setFailedImageUri(record.imageUri)}
          />
        ) : (
          <View style={[styles.emotionFallback, { backgroundColor: emotion.color + "22" }]}>
            <View
              style={[
                styles.emotionIconCircle,
                {
                  borderColor: emotion.color + "70",
                  backgroundColor: colors.card + "CC",
                },
              ]}
            >
              <Feather name={emotionIcon} size={48} color={emotion.color} />
            </View>
            <Text style={styles.emotionLabel}>{emotion.label}</Text>
          </View>
        )}
        {hasPhoto && emotion.key !== "neutral" && (
          <View style={styles.photoEmotionBadge}>
            <Feather name={emotionIcon} size={13} color={emotion.color} />
            <Text style={styles.photoEmotionLabel}>{emotion.label}</Text>
          </View>
        )}
      </View>

      <View style={styles.noteBlock}>
        <Text style={styles.noteEyebrow}>A moment to remember</Text>
        <Text style={styles.note}>{excerpt}</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.dateLabel}>{formatDate(record.date)}</Text>
        <View style={styles.footerMark} />
      </View>
    </View>
  );
}
