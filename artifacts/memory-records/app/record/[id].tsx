import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useRecords } from "@/context/RecordsContext";
import { useSettings } from "@/context/SettingsContext";
import { useObsidian } from "@/hooks/useObsidian";
import { useColors } from "@/hooks/useColors";

export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { records, updateRecord, deleteRecord } = useRecords();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { saveToObsidian } = useObsidian();
  const [saving, setSaving] = useState(false);

  const record = records.find((r) => r.id === id);

  if (!record) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Record not found.</Text>
      </View>
    );
  }

  const handleSaveToObsidian = async () => {
    if (!settings.configured) {
      Alert.alert("Not Configured", "Set your Obsidian vault name in Settings first.");
      return;
    }
    setSaving(true);
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await saveToObsidian(record, user?.username ?? "user");
    if (result.ok) {
      await updateRecord(record.id, { savedToObsidian: true });
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Sent to Obsidian ✓",
        "Obsidian has been opened. Switch back to Obsidian to see the new note in your vault."
      );
    } else if (result.reason === "not_configured") {
      Alert.alert("Not Configured", "Go to Settings and enter your Obsidian vault name first.");
    } else {
      Alert.alert(
        "Cannot Open Obsidian",
        "Could not open Obsidian. Make sure:\n\n" +
          "1. Obsidian is installed on this device\n" +
          "2. The Actions URI plugin is installed and enabled\n\n" +
          "In Obsidian: Settings → Community Plugins → Browse → \"Actions URI\""
      );
    }
    setSaving(false);
  };

  const handleDelete = () => {
    Alert.alert("Delete", "Delete this memory record?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteRecord(record.id);
          router.back();
        },
      },
    ]);
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    deleteBtn: { padding: 4 },
    scroll: { flex: 1 },
    photo: { width: "100%", height: 280 },
    content: { padding: 20, gap: 20 },
    metaCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 10,
    },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    metaLabel: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      width: 80,
    },
    metaValue: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      flex: 1,
    },
    noteSection: { gap: 8 },
    noteSectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    noteText: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 24,
    },
    obsidianBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: record.savedToObsidian ? colors.success + "20" : colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 14,
    },
    obsidianBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: record.savedToObsidian ? colors.success : colors.primaryForeground,
    },
    badge: {
      alignSelf: "flex-start",
      backgroundColor: colors.success + "22",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    badgeText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.success,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>{record.date}</Text>
        <Pressable style={s.deleteBtn} onPress={handleDelete}>
          <Feather name="trash-2" size={20} color={colors.destructive} />
        </Pressable>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 80 : insets.bottom + 40 }}>
        <Image source={{ uri: record.imageUri }} style={s.photo} contentFit="cover" />

        <View style={s.content}>
          {record.savedToObsidian && (
            <View style={s.badge}>
              <Text style={s.badgeText}>Saved to Obsidian</Text>
            </View>
          )}

          <View style={s.metaCard}>
            <View style={s.metaRow}>
              <Feather name="calendar" size={14} color={colors.primary} />
              <Text style={s.metaLabel}>Date</Text>
              <Text style={s.metaValue}>{record.date}</Text>
            </View>
            {record.location && (
              <View style={s.metaRow}>
                <Feather name="map-pin" size={14} color={colors.primary} />
                <Text style={s.metaLabel}>Location</Text>
                <Text style={s.metaValue}>{record.location}</Text>
              </View>
            )}
            {record.lat && record.lng && (
              <View style={s.metaRow}>
                <Feather name="globe" size={14} color={colors.primary} />
                <Text style={s.metaLabel}>GPS</Text>
                <Text style={s.metaValue}>{record.lat.toFixed(5)}, {record.lng.toFixed(5)}</Text>
              </View>
            )}
            <View style={s.metaRow}>
              <Feather name="clock" size={14} color={colors.primary} />
              <Text style={s.metaLabel}>Added</Text>
              <Text style={s.metaValue}>{new Date(record.createdAt).toLocaleString()}</Text>
            </View>
          </View>

          <View style={s.noteSection}>
            <Text style={s.noteSectionLabel}>Note</Text>
            <Text style={s.noteText}>{record.note || "No note added."}</Text>
          </View>

          <Pressable
            style={s.obsidianBtn}
            onPress={handleSaveToObsidian}
            disabled={saving}
          >
            <Feather
              name={record.savedToObsidian ? "check-circle" : "upload"}
              size={18}
              color={record.savedToObsidian ? colors.success : colors.primaryForeground}
            />
            <Text style={s.obsidianBtnText}>
              {saving ? "Opening Obsidian..." : record.savedToObsidian ? "Re-send to Obsidian" : "Save to Obsidian"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
