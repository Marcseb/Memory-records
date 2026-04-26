import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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
import { useAuth } from "@/context/AuthContext";
import { useRecords } from "@/context/RecordsContext";
import { VoiceLanguage, VOICE_LANGUAGES, useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { resetAllData } = useAuth();
  const { knownTags, deleteTag } = useRecords();
  const { settings, updateSettings } = useSettings();
  const [vaultName, setVaultName] = useState(settings.vaultName);
  const [folder, setFolder] = useState(settings.folder);
  const [authorName, setAuthorName] = useState(settings.authorName);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(true);
    await updateSettings({
      vaultName: vaultName.trim(),
      folder: folder.trim() || "Memory Records",
      authorName: authorName.trim(),
    });
    setSaving(false);
    Alert.alert("Saved", "Settings updated.");
  };

  const handleLanguageSelect = async (lang: VoiceLanguage) => {
    if (Platform.OS !== "web") await Haptics.selectionAsync();
    await updateSettings({ voiceLanguage: lang });
  };

  const handleDeleteTag = (tag: string) => {
    Alert.alert(
      `Delete tag "#${tag}"?`,
      "This removes it from the tag list. Existing records that use it are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteTag(tag) },
      ]
    );
  };

  const handleStorageDiagnostic = async () => {
    try {
      const rawRecords = await AsyncStorage.getItem("mr_records");
      const rawTags = await AsyncStorage.getItem("mr_tags");
      const rawSettings = await AsyncStorage.getItem("mr_obsidian_settings");

      let recordCount = 0;
      let firstRecordDate = "—";
      if (rawRecords) {
        try {
          const arr = JSON.parse(rawRecords);
          recordCount = arr.length;
          if (arr.length > 0) firstRecordDate = arr[arr.length - 1].date ?? "unknown";
        } catch { /* ignore */ }
      }

      const tagCount = rawTags ? (() => { try { return JSON.parse(rawTags).length; } catch { return 0; } })() : 0;
      const hasSettings = !!rawSettings;

      Alert.alert(
        "Storage Diagnostic",
        `Records in storage: ${recordCount}` +
        (recordCount > 0 ? `\nOldest record date: ${firstRecordDate}` : "\n⚠️ No records found in storage") +
        `\n\nTags saved: ${tagCount}` +
        `\nSettings present: ${hasSettings ? "yes" : "no"}`
      );
    } catch (e) {
      Alert.alert("Diagnostic Error", String(e));
    }
  };

  const handleResetAllData = () => {
    Alert.alert(
      "Reset All Data",
      "This will permanently delete all records, tags, and settings. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset Everything",
          style: "destructive",
          onPress: async () => {
            await resetAllData();
            Alert.alert("Done", "All data has been cleared.");
          },
        },
      ]
    );
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    scroll: { flex: 1 },
    section: {
      paddingHorizontal: 20,
      paddingTop: 24,
    },
    sectionTitle: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 12,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    rowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowLabel: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      flex: 1,
    },
    rowValue: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      marginBottom: 12,
    },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 4,
    },
    saveBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    infoBox: {
      backgroundColor: colors.surface,
      borderRadius: colors.radius,
      padding: 14,
      gap: 6,
    },
    infoTitle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.accent,
    },
    infoText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 18,
    },
    destructiveRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 14,
    },
    destructiveText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.destructive,
    },
    status: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    langRow: {
      flexDirection: "row",
      gap: 10,
    },
    langChip: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    langChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + "18",
    },
    langFlag: {
      fontSize: 18,
    },
    langLabel: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    langLabelActive: {
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
    },
    langCheck: {
      position: "absolute",
      top: 6,
      right: 6,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Settings</Text>
      </View>

      <KeyboardAwareScrollView
        style={s.scroll}
        contentContainerStyle={{
          paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 80,
        }}
      >
        {/* Voice language */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Voice-to-Text Language</Text>
          <View style={s.langRow}>
            {VOICE_LANGUAGES.map((lang) => {
              const active = settings.voiceLanguage === lang.code;
              return (
                <Pressable
                  key={lang.code}
                  style={[s.langChip, active && s.langChipActive]}
                  onPress={() => handleLanguageSelect(lang.code)}
                >
                  <Text style={s.langFlag}>{lang.flag}</Text>
                  <Text style={[s.langLabel, active && s.langLabelActive]}>
                    {lang.label}
                  </Text>
                  {active && (
                    <View style={s.langCheck}>
                      <Feather name="check" size={11} color={colors.primary} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          <View style={{ height: 6 }} />
          <View style={s.infoBox}>
            <Text style={[s.infoText, { fontSize: 12 }]}>
              Selected language is used for speech recognition when recording voice notes. Default: Français.
            </Text>
          </View>
        </View>

        {/* Tags */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Tags</Text>
          {knownTags.length === 0 ? (
            <View style={s.infoBox}>
              <Text style={s.infoText}>No tags yet. Add tags when creating a new record.</Text>
            </View>
          ) : (
            <View style={s.card}>
              {knownTags.map((tag, i) => (
                <View key={tag} style={[s.row, i < knownTags.length - 1 && s.rowBorder]}>
                  <Feather name="tag" size={16} color={colors.primary} />
                  <Text style={s.rowLabel}>#{tag}</Text>
                  <Pressable onPress={() => handleDeleteTag(tag)} hitSlop={10}>
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Obsidian */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Obsidian Integration</Text>
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Setup Required</Text>
            <Text style={s.infoText}>
              Install the "Actions URI" plugin in Obsidian:{"\n"}
              Settings → Community Plugins → Browse → "Actions URI" → Install & Enable
            </Text>
          </View>
        </View>

        <View style={[s.section, { paddingTop: 16 }]}>
          <Text style={s.label}>Author Name</Text>
          <TextInput
            style={s.input}
            value={authorName}
            onChangeText={setAuthorName}
            placeholder="e.g. Marie"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Text style={s.label}>Vault Name</Text>
          <TextInput
            style={s.input}
            value={vaultName}
            onChangeText={setVaultName}
            placeholder="e.g. MyVault"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={s.label}>Folder in Vault</Text>
          <TextInput
            style={s.input}
            value={folder}
            onChangeText={setFolder}
            placeholder="Memory Records"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={s.status}>
            <View
              style={[
                s.statusDot,
                {
                  backgroundColor: settings.configured
                    ? colors.success
                    : colors.mutedForeground,
                },
              ]}
            />
            <Text style={[s.rowValue, { fontSize: 12 }]}>
              {settings.configured
                ? `Vault: ${settings.vaultName}`
                : "Not configured"}
            </Text>
          </View>
          <View style={{ height: 12 }} />
          <Pressable style={s.saveBtn} onPress={handleSave} disabled={saving}>
            <Text style={s.saveBtnText}>
              {saving ? "Saving..." : "Save Settings"}
            </Text>
          </Pressable>
        </View>

        {/* About */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>About</Text>
          <View style={s.card}>
            <View style={[s.row, s.rowBorder]}>
              <Feather name="info" size={18} color={colors.primary} />
              <Text style={s.rowLabel}>Memory Records</Text>
              <Text style={s.rowValue}>v1.0</Text>
            </View>
            <Pressable style={s.row} onPress={handleStorageDiagnostic}>
              <Feather name="database" size={18} color={colors.mutedForeground} />
              <Text style={[s.rowLabel, { color: colors.mutedForeground }]}>Storage diagnostic</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {/* Danger zone */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Danger Zone</Text>
          <View style={s.card}>
            <Pressable style={s.destructiveRow} onPress={handleResetAllData}>
              <Feather name="trash-2" size={16} color={colors.destructive} />
              <Text style={s.destructiveText}>Reset All Data</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
