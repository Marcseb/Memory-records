import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRecords } from "@/context/RecordsContext";
import { useSettings } from "@/context/SettingsContext";
import { useObsidian } from "@/hooks/useObsidian";
import { useColors } from "@/hooks/useColors";

export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { records, updateRecord, deleteRecord } = useRecords();
  const { settings } = useSettings();
  const { saveToObsidian } = useObsidian();
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedNote, setEditedNote] = useState("");
  const editInputRef = useRef<TextInput>(null);

  const record = records.find((r) => r.id === id);

  if (!record) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Record not found.</Text>
      </View>
    );
  }

  const handleStartEdit = () => {
    setEditedNote(record.note ?? "");
    setIsEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 100);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedNote("");
  };

  const handleSaveEdit = async () => {
    const trimmed = editedNote.trim();
    if (!trimmed) {
      Alert.alert("Empty Note", "Note cannot be empty.");
      return;
    }
    if (trimmed === record.note) {
      setIsEditing(false);
      return;
    }
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const newEditCount = (record.editCount ?? 0) + 1;
    const updatedRecord = { ...record, note: trimmed, editCount: newEditCount };

    await updateRecord(record.id, { note: trimmed, editCount: newEditCount });
    setIsEditing(false);
    setEditedNote("");

    if (settings.configured) {
      setSaving(true);
      const result = await saveToObsidian(updatedRecord);
      if (result.ok) {
        await updateRecord(record.id, { savedToObsidian: true, filename: record.filename ?? result.filename });
        if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Saved & Sent",
          `Note updated locally and sent to Obsidian as version v${newEditCount + 1}.`
        );
      } else if (result.reason === "open_failed") {
        Alert.alert(
          "Saved Locally",
          "Note updated in the app. Could not open Obsidian automatically — tap \"Save to Obsidian\" to retry."
        );
      }
      setSaving(false);
    } else {
      Alert.alert("Saved", "Note updated.");
    }
  };

  const handleSaveToObsidian = async () => {
    if (!settings.configured) {
      Alert.alert("Not Configured", "Set your Obsidian vault name in Settings first.");
      return;
    }
    setSaving(true);
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await saveToObsidian(record);
    if (result.ok) {
      await updateRecord(record.id, {
        savedToObsidian: true,
        filename: record.filename ?? result.filename,
      });
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const version = (record.editCount ?? 0) > 0 ? ` (v${(record.editCount ?? 0) + 1})` : "";
      Alert.alert(
        "Sent to Obsidian ✓",
        `Obsidian has been opened. Switch back to Obsidian to see the note${version} in your vault.`
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

  const handleContinue = async () => {
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await AsyncStorage.setItem(
      "mr_temp_context",
      JSON.stringify({ note: record.note ?? "", tags: record.tags ?? [] })
    );
    router.push({ pathname: "/new-record", params: { fromContext: "1" } });
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
    editingTitle: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.accent,
    },
    continueBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: colors.primary + "18",
      borderWidth: 1,
      borderColor: colors.primary + "40",
    },
    continueBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    cancelBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelBtnText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    saveEditBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: colors.primary,
    },
    saveEditBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
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
    noteSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    noteSectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    editNoteBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    editNoteBtnText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    noteText: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 24,
    },
    noteInput: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 24,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: colors.radius,
      padding: 12,
      minHeight: 140,
      textAlignVertical: "top",
      backgroundColor: colors.card,
    },
    editActions: {
      flexDirection: "row",
      gap: 10,
      justifyContent: "flex-end",
    },
    editCancelInline: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    editCancelInlineText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    editSaveInline: {
      flex: 2,
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
    },
    editSaveInlineText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    versionBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.accent + "22",
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    versionBadgeText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.accent,
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

  const editCount = record.editCount ?? 0;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Pressable onPress={isEditing ? handleCancelEdit : () => router.back()}>
          <Feather name={isEditing ? "x" : "arrow-left"} size={22} color={isEditing ? colors.mutedForeground : colors.foreground} />
        </Pressable>

        {isEditing ? (
          <Text style={s.editingTitle}>Editing note…</Text>
        ) : (
          <Text style={s.headerTitle}>{record.date}</Text>
        )}

        {isEditing ? (
          <Pressable style={s.saveEditBtn} onPress={handleSaveEdit} disabled={saving}>
            <Feather name="check" size={14} color={colors.primaryForeground} />
            <Text style={s.saveEditBtnText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={s.continueBtn} onPress={handleContinue}>
              <Feather name="file-plus" size={14} color={colors.primary} />
              <Text style={s.continueBtnText}>New note</Text>
            </Pressable>
            <Pressable style={s.deleteBtn} onPress={handleDelete}>
              <Feather name="trash-2" size={20} color={colors.destructive} />
            </Pressable>
          </>
        )}
      </View>

      <KeyboardAwareScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 80 : insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        {record.imageUri ? (
          <Image source={{ uri: record.imageUri }} style={s.photo} contentFit="cover" />
        ) : null}

        <View style={s.content}>
          {record.savedToObsidian && (
            <View style={s.badge}>
              <Text style={s.badgeText}>Saved to Obsidian</Text>
            </View>
          )}

          {editCount > 0 && (
            <View style={s.versionBadge}>
              <Text style={s.versionBadgeText}>Edited · v{editCount + 1}</Text>
            </View>
          )}

          <View style={s.metaCard}>
            <View style={s.metaRow}>
              <Feather name="calendar" size={14} color={colors.primary} />
              <Text style={s.metaLabel}>Date</Text>
              <Text style={s.metaValue}>{record.date}</Text>
            </View>
            {record.contextYear !== undefined && (
              <View style={s.metaRow}>
                <Feather name="clock" size={14} color={colors.primary} />
                <Text style={s.metaLabel}>Memory year</Text>
                <Text style={s.metaValue}>{record.contextYear}</Text>
              </View>
            )}
            {record.tags && record.tags.length > 0 && (
              <View style={s.metaRow}>
                <Feather name="tag" size={14} color={colors.primary} />
                <Text style={s.metaLabel}>Tags</Text>
                <Text style={s.metaValue}>{record.tags.map((t) => `#${t}`).join("  ")}</Text>
              </View>
            )}
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
            <View style={s.noteSectionHeader}>
              <Text style={s.noteSectionLabel}>Note</Text>
              {!isEditing && (
                <Pressable style={s.editNoteBtn} onPress={handleStartEdit}>
                  <Feather name="edit-2" size={13} color={colors.primary} />
                  <Text style={s.editNoteBtnText}>Edit</Text>
                </Pressable>
              )}
            </View>

            {isEditing ? (
              <>
                <TextInput
                  ref={editInputRef}
                  style={s.noteInput}
                  value={editedNote}
                  onChangeText={setEditedNote}
                  multiline
                  autoFocus
                  scrollEnabled={false}
                  placeholder="Write your note here…"
                  placeholderTextColor={colors.mutedForeground}
                />
                <View style={s.editActions}>
                  <Pressable style={s.editCancelInline} onPress={handleCancelEdit}>
                    <Text style={s.editCancelInlineText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={s.editSaveInline} onPress={handleSaveEdit} disabled={saving}>
                    <Text style={s.editSaveInlineText}>
                      {saving ? "Saving…" : settings.configured ? "Save & Send to Obsidian" : "Save"}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={s.noteText}>{record.note || "No note added."}</Text>
            )}
          </View>

          {!isEditing && (
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
                {saving ? "Opening Obsidian…" : record.savedToObsidian ? "Re-send to Obsidian" : "Save to Obsidian"}
              </Text>
            </Pressable>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
