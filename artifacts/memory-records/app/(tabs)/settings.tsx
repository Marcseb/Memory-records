import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { StorageAccessFramework } from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { MemoryRecord, useRecords } from "@/context/RecordsContext";
import { VoiceLanguage, VOICE_LANGUAGES, useSettings } from "@/context/SettingsContext";
import { useColors } from "@/hooks/useColors";
import { isObsidianMarkdown, parseMultipleObsidianNotes, parseObsidianNote } from "@/utils/obsidianParser";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { resetAllData } = useAuth();
  const { records, knownTags, deleteTag, importRecords } = useRecords();
  const { settings, updateSettings } = useSettings();
  const [vaultName, setVaultName] = useState(settings.vaultName);
  const [folder, setFolder] = useState(settings.folder);
  const [authorName, setAuthorName] = useState(settings.authorName);
  const [saving, setSaving] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  const [mistralKey, setMistralKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [showMistralKey, setShowMistralKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [aiKeysSaving, setAiKeysSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [m, o] = await Promise.all([
          SecureStore.getItemAsync("mr_mistral_key"),
          SecureStore.getItemAsync("mr_openai_key"),
        ]);
        if (m) setMistralKey(m);
        if (o) setOpenaiKey(o);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleExport = async () => {
    try {
      const payload = JSON.stringify({ records, tags: knownTags }, null, 2);
      await Share.share({
        message: payload,
        title: "Memory Records Backup",
      });
    } catch (e) {
      Alert.alert("Export Error", String(e));
    }
  };

  const processImportText = async (text: string) => {
    let incoming: MemoryRecord[];
    let incomingTags: string[] = [];

    if (isObsidianMarkdown(text) || (text.includes("**Date:**") && text.includes("## Note"))) {
      const parsed = parseMultipleObsidianNotes(text);
      if (parsed.length === 0) {
        const single = parseObsidianNote(text);
        if (!single) throw new Error("Could not find a valid Memory Records note in this text.");
        parsed.push(single);
      }
      incoming = parsed.map((r) => ({
        ...r,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
      })) as MemoryRecord[];
      incomingTags = Array.from(new Set(incoming.flatMap((r) => r.tags ?? [])));
    } else {
      const parsedJson = JSON.parse(text);
      const rawRecords: MemoryRecord[] = Array.isArray(parsedJson)
        ? parsedJson
        : Array.isArray(parsedJson?.records)
        ? parsedJson.records
        : null;
      incomingTags = Array.isArray(parsedJson?.tags) ? parsedJson.tags : [];
      if (!rawRecords) throw new Error("JSON does not contain a valid records array.");
      incoming = rawRecords.filter(
        (r) => r && typeof r.id === "string" && typeof r.note === "string"
      );
      if (incoming.length === 0) throw new Error("No valid records found in the backup.");
    }

    await importRecords(incoming, incomingTags);
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return incoming.length;
  };

  const handleImportConfirm = async () => {
    Keyboard.dismiss();
    setImporting(true);
    try {
      const count = await processImportText(importText.trim());
      setImportModalVisible(false);
      setImportText("");
      Alert.alert("Import Complete", `${count} record${count !== 1 ? "s" : ""} restored.`);
    } catch (e) {
      Alert.alert("Import Failed", `Could not parse the pasted content:\n${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  const handlePickJsonFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/plain", "text/json", "*/*"],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || result.assets.length === 0) return;
      setImporting(true);
      const content = await readFileContent(result.assets[0].uri);
      const count = await processImportText(content.trim());
      setImportModalVisible(false);
      setImportText("");
      Alert.alert("Import Complete", `${count} record${count !== 1 ? "s" : ""} restored.`);
    } catch (e) {
      Alert.alert("Import Failed", `Could not read the file:\n${String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  // Extract a human-readable filename from a SAF content URI or regular URI
  const getNameFromUri = (uri: string): string => {
    try {
      const decoded = decodeURIComponent(uri);
      // SAF URIs encode the path after the last ':'
      const colonPart = decoded.split(":").pop() ?? decoded;
      return colonPart.split("/").pop() ?? uri.slice(-20);
    } catch {
      return uri.slice(-20);
    }
  };

  const readFileContent = async (uri: string): Promise<string> => {
    try {
      return await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch {
      // Fallback: fetch() handles content:// and SAF URIs on Android
      const res = await fetch(uri);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    }
  };

  const processUris = async (
    uris: Array<{ uri: string; name?: string }>
  ): Promise<{ parsed: Array<Omit<MemoryRecord, "id">>; readErrors: string[]; parseErrors: string[] }> => {
    const parsed: Array<Omit<MemoryRecord, "id">> = [];
    const readErrors: string[] = [];
    const parseErrors: string[] = [];

    for (const { uri, name } of uris) {
      const label = name ?? getNameFromUri(uri);
      try {
        const content = await readFileContent(uri);
        const note = parseObsidianNote(content);
        if (note) {
          parsed.push(note);
        } else {
          parseErrors.push(label);
        }
      } catch (e) {
        readErrors.push(`${label} (${String(e)})`);
      }
    }
    return { parsed, readErrors, parseErrors };
  };

  const finishImport = async (
    parsed: Array<Omit<MemoryRecord, "id">>,
    readErrors: string[],
    parseErrors: string[]
  ) => {
    if (parsed.length === 0) {
      let msg = "Could not import any notes from the selected file(s).";
      if (readErrors.length > 0) msg += `\n\nRead error(s):\n${readErrors.join("\n")}`;
      if (parseErrors.length > 0) {
        msg += `\n\nNot recognised as Memory Records notes:\n${parseErrors.join("\n")}`;
        msg += "\n\nMake sure you pick .md files created by this app.";
      }
      Alert.alert("No notes imported", msg);
      return;
    }

    const incoming: MemoryRecord[] = parsed.map((r) => ({
      ...r,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
    })) as MemoryRecord[];
    const incomingTags = Array.from(new Set(incoming.flatMap((r) => r.tags ?? [])));

    await importRecords(incoming, incomingTags);
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let msg = `${parsed.length} note${parsed.length !== 1 ? "s" : ""} imported.`;
    const skipped = [...parseErrors, ...readErrors];
    if (skipped.length > 0) msg += `\n\n${skipped.length} file(s) skipped: ${skipped.join(", ")}`;
    Alert.alert("Import Complete", msg);
  };

  const handleObsidianImport = async () => {
    try {
      if (Platform.OS === "android") {
        // Android: use folder picker (opens file browser, not "Recent")
        const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perm.granted) return;

        const allUris = await StorageAccessFramework.readDirectoryAsync(perm.directoryUri);

        // Filter to .md files — SAF URIs encode the path so we URL-decode first
        const mdUris = allUris.filter((uri) => {
          try {
            return decodeURIComponent(uri).toLowerCase().endsWith(".md");
          } catch {
            return uri.toLowerCase().includes(".md");
          }
        });

        if (mdUris.length === 0) {
          Alert.alert(
            "No .md files found",
            "The selected folder contains no Markdown files. Navigate to the folder inside your Obsidian vault that contains the Memory Records notes (e.g. Obsidian → YourVault → Memory Records)."
          );
          return;
        }

        const { parsed, readErrors, parseErrors } = await processUris(
          mdUris.map((uri) => ({ uri }))
        );
        await finishImport(parsed, readErrors, parseErrors);
      } else {
        // iOS / web: standard file picker (Files app, supports vault via iCloud)
        const result = await DocumentPicker.getDocumentAsync({
          type: ["text/markdown", "text/plain", "application/octet-stream", "*/*"],
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (result.canceled || result.assets.length === 0) return;

        const { parsed, readErrors, parseErrors } = await processUris(
          result.assets.map((a) => ({ uri: a.uri, name: a.name ?? undefined }))
        );
        await finishImport(parsed, readErrors, parseErrors);
      }
    } catch (e) {
      Alert.alert("Import Error", String(e));
    }
  };

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

  const handleSaveAiKeys = async () => {
    setAiKeysSaving(true);
    try {
      await Promise.all([
        SecureStore.setItemAsync("mr_mistral_key", mistralKey.trim()),
        SecureStore.setItemAsync("mr_openai_key", openaiKey.trim()),
      ]);
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saved", "AI keys saved securely on this device.");
    } catch (e) {
      Alert.alert("Error", "Could not save keys: " + String(e));
    } finally {
      setAiKeysSaving(false);
    }
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
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingTop: 12,
      gap: 12,
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 4,
    },
    modalTitle: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    modalHint: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 18,
    },
    importInput: {
      borderWidth: 1,
      borderRadius: colors.radius,
      padding: 12,
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      minHeight: 140,
      backgroundColor: colors.surface,
    },
    modalActions: {
      flexDirection: "row",
      gap: 10,
    },
    modalBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: colors.radius,
      alignItems: "center",
    },
    modalBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
    },
  });

  return (
    <View style={s.container}>
      {/* Import Modal */}
      <Modal
        visible={importModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setImportModalVisible(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => { Keyboard.dismiss(); setImportModalVisible(false); }}>
          <Pressable style={[s.modalSheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Import Backup</Text>
            <Text style={s.modalHint}>
              Pick your JSON backup file, or paste JSON / Obsidian note text below. Format is detected automatically — records are merged, nothing is deleted.
            </Text>

            {/* Primary action: pick file */}
            <Pressable
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: colors.primary,
                borderRadius: colors.radius,
                paddingVertical: 12,
                opacity: importing ? 0.6 : 1,
              }}
              onPress={handlePickJsonFile}
              disabled={importing}
            >
              <Feather name="file" size={16} color={colors.primaryForeground} />
              <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.primaryForeground }}>
                {importing ? "Importing…" : "Pick JSON file"}
              </Text>
            </Pressable>

            {/* Divider */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                or paste text
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            <TextInput
              style={[s.importInput, { color: colors.foreground, borderColor: colors.border }]}
              placeholder={"Paste JSON backup or Obsidian note text here…"}
              placeholderTextColor={colors.mutedForeground}
              value={importText}
              onChangeText={setImportText}
              multiline
              autoCorrect={false}
              autoCapitalize="none"
              textAlignVertical="top"
            />
            <View style={s.modalActions}>
              <Pressable
                style={[s.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => setImportModalVisible(false)}
              >
                <Text style={[s.modalBtnText, { color: colors.foreground }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.modalBtn, { backgroundColor: colors.primary, opacity: (importing || importText.trim().length === 0) ? 0.4 : 1 }]}
                onPress={handleImportConfirm}
                disabled={importing || importText.trim().length === 0}
              >
                <Text style={[s.modalBtnText, { color: colors.primaryForeground }]}>
                  {importing ? "Importing…" : "Import text"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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

        {/* AI Interviewer */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>AI Interviewer</Text>
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Your keys, your device</Text>
            <Text style={s.infoText}>
              API keys are stored encrypted on this device only — they never leave it. Each person using this app needs their own key.{"\n\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>Mistral</Text> (recommended): get a free key at console.mistral.ai{"\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>OpenAI</Text> (fallback): get a key at platform.openai.com
            </Text>
          </View>
          <View style={{ height: 12 }} />
          <Text style={s.label}>Mistral API Key</Text>
          <View style={{ position: "relative", marginBottom: 12 }}>
            <TextInput
              style={[s.input, { marginBottom: 0, paddingRight: 44 }]}
              value={mistralKey}
              onChangeText={setMistralKey}
              placeholder="sk-… (recommended)"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showMistralKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => setShowMistralKey((v) => !v)}
              style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}
              hitSlop={8}
            >
              <Feather name={showMistralKey ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <Text style={s.label}>OpenAI API Key <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>(optional fallback)</Text></Text>
          <View style={{ position: "relative", marginBottom: 12 }}>
            <TextInput
              style={[s.input, { marginBottom: 0, paddingRight: 44 }]}
              value={openaiKey}
              onChangeText={setOpenaiKey}
              placeholder="sk-… (optional)"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showOpenaiKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => setShowOpenaiKey((v) => !v)}
              style={{ position: "absolute", right: 12, top: 0, bottom: 0, justifyContent: "center" }}
              hitSlop={8}
            >
              <Feather name={showOpenaiKey ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          <View style={s.status}>
            <View style={[s.statusDot, { backgroundColor: mistralKey.trim() || openaiKey.trim() ? colors.success : colors.mutedForeground }]} />
            <Text style={[s.rowValue, { fontSize: 12 }]}>
              {mistralKey.trim()
                ? "Mistral key configured" + (openaiKey.trim() ? " + OpenAI fallback" : "")
                : openaiKey.trim()
                ? "OpenAI key configured (no Mistral)"
                : "No key configured — AI Interviewer disabled"}
            </Text>
          </View>
          <View style={{ height: 12 }} />
          <Pressable style={s.saveBtn} onPress={handleSaveAiKeys} disabled={aiKeysSaving}>
            <Text style={s.saveBtnText}>{aiKeysSaving ? "Saving…" : "Save AI Keys"}</Text>
          </Pressable>
        </View>

        {/* Backup */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Backup & Restore</Text>
          <View style={s.infoBox}>
            <Text style={s.infoText}>
              Export saves all your records and tags as a JSON file you can store anywhere. Import merges a backup back in without deleting existing records.{"\n\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>Import from Obsidian</Text> opens a folder picker — navigate to your vault's Memory Records folder to import all notes at once.
            </Text>
          </View>
          <View style={s.card}>
            <Pressable style={[s.row, s.rowBorder]} onPress={handleExport}>
              <Feather name="upload" size={18} color={colors.primary} />
              <Text style={s.rowLabel}>Export all records</Text>
              <Text style={s.rowValue}>{records.length} record{records.length !== 1 ? "s" : ""}</Text>
            </Pressable>
            <Pressable style={[s.row, s.rowBorder]} onPress={() => { setImportText(""); setImportModalVisible(true); }}>
              <Feather name="download" size={18} color={colors.primary} />
              <Text style={s.rowLabel}>Import from JSON backup</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
            <Pressable style={s.row} onPress={handleObsidianImport}>
              <Feather name="file-text" size={18} color={colors.primary} />
              <Text style={s.rowLabel}>Import from Obsidian notes</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
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
            <Pressable style={[s.row, s.rowBorder]} onPress={() => router.push("/help")}>
              <Feather name="help-circle" size={18} color={colors.primary} />
              <Text style={s.rowLabel}>Help & features guide</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
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
