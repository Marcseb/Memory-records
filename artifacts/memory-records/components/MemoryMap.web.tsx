import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  getMapLocationLabel,
  getMapRecordTitle,
  type MemoryMapProps,
} from "@/components/MemoryMap.types";
import { useColors } from "@/hooks/useColors";

export function MemoryMap({
  records,
  onOpenRecord,
}: MemoryMapProps) {
  const colors = useColors();
  const styles = StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 150,
      paddingBottom: 100,
    },
    note: {
      marginBottom: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      lineHeight: 19,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      backgroundColor: colors.surfaceElevated,
    },
    pin: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 19,
      backgroundColor: colors.primary + "18",
    },
    rowContent: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
    },
    location: {
      marginTop: 4,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 12,
    },
    date: {
      marginTop: 4,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 12,
    },
    chevron: {
      marginLeft: 2,
    },
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.note}>
        The interactive map is available in the mobile app. These are your
        memories with saved coordinates.
      </Text>
      {records.map((record) => (
        <Pressable
          key={record.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${getMapRecordTitle(record)} from ${record.date}`}
          onPress={() => onOpenRecord(record)}
          style={({ pressed }) => [
            styles.row,
            pressed ? { opacity: 0.78 } : undefined,
          ]}
        >
          <View style={styles.pin}>
            <Feather name="map-pin" size={17} color={colors.primary} />
          </View>
          <View style={styles.rowContent}>
            <Text numberOfLines={1} style={styles.title}>
              {getMapRecordTitle(record)}
            </Text>
            <Text numberOfLines={1} style={styles.location}>
              {getMapLocationLabel(record)}
            </Text>
            <Text style={styles.date}>{record.date}</Text>
          </View>
          <Feather
            name="chevron-right"
            size={17}
            color={colors.mutedForeground}
            style={styles.chevron}
          />
        </Pressable>
      ))}
    </ScrollView>
  );
}
