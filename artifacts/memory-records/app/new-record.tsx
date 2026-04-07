import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useAuth } from "@/context/AuthContext";
import { MemoryRecord, useRecords } from "@/context/RecordsContext";
import { useSettings } from "@/context/SettingsContext";
import { useObsidian } from "@/hooks/useObsidian";
import { useColors } from "@/hooks/useColors";

interface PhotoData {
  uri: string;
  date?: string;
  hasMetadata: boolean;
  lat?: number;
  lng?: number;
}

function generateId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseExifDate(exif: Record<string, unknown> | null | undefined): string | undefined {
  if (!exif) return undefined;
  const raw = exif["DateTimeOriginal"] ?? exif["DateTime"] ?? exif["DateTimeDigitized"];
  if (!raw || typeof raw !== "string") return undefined;
  const parts = raw.split(" ")[0]?.replace(/:/g, "-");
  return parts ?? undefined;
}

function getNotePlaceholder(langCode: string): string {
  switch (langCode) {
    case "fr-FR": return "Tapez ou dictez votre note ici...";
    case "it-IT": return "Digitate o dettate la vostra nota qui...";
    default:      return "Type or dictate your note here...";
  }
}

function getDictateLabel(langCode: string): string {
  switch (langCode) {
    case "fr-FR": return "Dicter une note";
    case "it-IT": return "Dettare una nota";
    default:      return "Dictate a note";
  }
}

function getDictateHint(langCode: string): string {
  switch (langCode) {
    case "fr-FR": return "Tapez votre note ou appuyez sur 🎤 sur le clavier pour dicter.";
    case "it-IT": return "Digitate la nota o premete 🎤 sulla tastiera per dettare.";
    default:      return "Type your note or tap 🎤 on your keyboard to dictate.";
  }
}

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
}

export default function NewRecordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { addRecord, knownTags, addTag } = useRecords();
  const { settings } = useSettings();
  const { saveToObsidian } = useObsidian();

  const [mode, setMode] = useState<"photo" | "note" | null>(null);
  const [photo, setPhoto] = useState<PhotoData | null>(null);
  const [note, setNote] = useState("");
  const [manualDate, setManualDate] = useState(todayString());
  const [isSaving, setIsSaving] = useState(false);

  // Tag state
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagDraft, setNewTagDraft] = useState("");
  const newTagRef = useRef<TextInput>(null);

  // Voice modal
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState("");
  const voiceInputRef = useRef<TextInput>(null);

  const handleGalleryPick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Allow access to your photo library to pick images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      exif: true,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const exifDate = parseExifDate(asset.exif as Record<string, unknown> | null);
    const lat = typeof asset.exif?.["GPSLatitude"] === "number" ? (asset.exif["GPSLatitude"] as number) : undefined;
    const lng = typeof asset.exif?.["GPSLongitude"] === "number" ? (asset.exif["GPSLongitude"] as number) : undefined;
    setPhoto({ uri: asset.uri, date: exifDate, hasMetadata: !!exifDate, lat, lng });
    if (exifDate) setManualDate(exifDate);
    setMode("photo");
  };

  const handleNoteMode = () => {
    setPhoto(null);
    setManualDate(todayString());
    setMode("note");
  };

  const handleSelectTag = (tag: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSelectedTag((prev) => (prev === tag ? null : tag));
    setShowNewTagInput(false);
    setNewTagDraft("");
  };

  const handleNewTagOpen = () => {
    setSelectedTag(null);
    setShowNewTagInput(true);
    setTimeout(() => newTagRef.current?.focus(), 100);
  };

  const handleNewTagConfirm = () => {
    const tag = normalizeTag(newTagDraft);
    if (tag) {
      addTag(tag);
      setSelectedTag(tag);
    }
    setShowNewTagInput(false);
    setNewTagDraft("");
  };

  const handleVoiceOpen = () => {
    setVoiceDraft("");
    setVoiceModalVisible(true);
    setTimeout(() => voiceInputRef.current?.focus(), 150);
  };

  const handleVoiceConfirm = () => {
    const trimmed = voiceDraft.trim();
    if (trimmed) {
      setNote((prev) => (prev ? `${prev} ${trimmed}` : trimmed));
    }
    setVoiceModalVisible(false);
    setVoiceDraft("");
  };

  const handleVoiceCancel = () => {
    setVoiceModalVisible(false);
    setVoiceDraft("");
  };

  const handleReset = () => {
    setMode(null);
    setPhoto(null);
    setNote("");
    setManualDate(todayString());
    setSelectedTag(null);
    setShowNewTagInput(false);
    setNewTagDraft("");
  };

  const handleSave = async () => {
    if (!note.trim()) {
      Alert.alert("No Note", "Please write or dictate a note before saving.");
      return;
    }
    setIsSaving(true);
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const record: MemoryRecord = {
      id: generateId(),
      imageUri: photo?.uri,
      tag: selectedTag ?? undefined,
      note: note.trim(),
      date: photo?.date ?? manualDate,
      location: undefined,
      lat: photo?.lat,
      lng: photo?.lng,
      savedToObsidian: false,
      createdAt: Date.now(),
    };

    await addRecord(record);

    if (settings.configured && user) {
      const result = await saveToObsidian(record, user.username);
      if (!result.ok && result.reason === "open_failed") {
        Alert.alert(
          "Cannot Open Obsidian",
          "Record saved locally. Open the record and tap \"Save to Obsidian\" when ready.\n\n" +
            "Make sure Obsidian is installed with the Actions URI plugin enabled."
        );
      }
    }

    setIsSaving(false);
    router.back();
  };

  const hasExifDate = photo?.hasMetadata && !!photo.date;
  const showContent = mode !== null;

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
    backBtn: { padding: 4 },
    headerTitle: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      flex: 1,
    },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    saveBtnDisabled: { backgroundColor: colors.muted },
    saveBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    scroll: { flex: 1 },
    modePickerContainer: {
      flex: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      gap: 14,
    },
    modePickerLabel: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textAlign: "center",
      marginBottom: 8,
    },
    modePicker: { flexDirection: "row", gap: 14 },
    modeBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 28,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    modeBtnText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    modeBtnSub: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
    },
    section: { padding: 16, gap: 10 },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    photoPreview: {
      width: "100%",
      height: 220,
      borderRadius: colors.radius,
      backgroundColor: colors.muted,
    },
    changePhotoBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 12,
    },
    changeBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    metaBox: {
      backgroundColor: colors.surface,
      borderRadius: colors.radius,
      padding: 12,
      gap: 4,
    },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    metaText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    metaHighlight: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    warningBox: {
      backgroundColor: colors.accent + "18",
      borderRadius: colors.radius,
      padding: 12,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
    },
    warningText: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.accent,
      lineHeight: 18,
    },
    dateInput: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    // Tag section
    tagRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
    },
    tagChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    tagChipActive: {
      backgroundColor: colors.primary + "18",
      borderColor: colors.primary,
    },
    tagChipText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    tagChipTextActive: {
      color: colors.primary,
    },
    addTagBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: "dashed",
    },
    addTagBtnText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    newTagRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 4,
    },
    newTagInput: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1.5,
      borderColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    newTagConfirm: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
    },
    newTagConfirmText: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    noteContainer: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    noteInput: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      minHeight: 120,
      textAlignVertical: "top",
    },
    noteToolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: 8,
    },
    voiceBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: colors.primary + "18",
    },
    voiceBtnText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    obsidianHint: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    obsidianHintText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: settings.configured ? colors.success : colors.mutedForeground,
    },
    // Voice modal
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    modalSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: Platform.OS === "web" ? 32 : insets.bottom + 24,
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 4,
    },
    modalHint: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 14,
      lineHeight: 18,
    },
    modalInput: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      minHeight: 100,
      textAlignVertical: "top",
      marginBottom: 14,
    },
    modalBtnRow: { flexDirection: "row", gap: 10 },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: 13,
      alignItems: "center",
      borderRadius: colors.radius,
      backgroundColor: colors.surface,
    },
    modalCancelText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    modalConfirmBtn: {
      flex: 2,
      paddingVertical: 13,
      alignItems: "center",
      borderRadius: colors.radius,
      backgroundColor: colors.primary,
    },
    modalConfirmText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
  });

  return (
    <View style={s.container}>
      {/* Voice dictation modal */}
      <Modal
        visible={voiceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleVoiceCancel}
      >
        <Pressable style={s.modalOverlay} onPress={handleVoiceCancel}>
          <Pressable style={s.modalSheet} onPress={Keyboard.dismiss}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{getDictateLabel(settings.voiceLanguage)}</Text>
            <Text style={s.modalHint}>{getDictateHint(settings.voiceLanguage)}</Text>
            <TextInput
              ref={voiceInputRef}
              style={s.modalInput}
              value={voiceDraft}
              onChangeText={setVoiceDraft}
              placeholder={getNotePlaceholder(settings.voiceLanguage)}
              placeholderTextColor={colors.mutedForeground}
              multiline
              autoFocus
              maxLength={2000}
            />
            <View style={s.modalBtnRow}>
              <Pressable style={s.modalCancelBtn} onPress={handleVoiceCancel}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalConfirmBtn} onPress={handleVoiceConfirm}>
                <Text style={s.modalConfirmText}>Add to note</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={mode !== null ? handleReset : () => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>New Memory</Text>
        {showContent && (
          <Pressable
            style={[s.saveBtn, isSaving && s.saveBtnDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={s.saveBtnText}>Save</Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Mode picker — shown before choosing */}
      {!showContent ? (
        <View style={s.modePickerContainer}>
          <Text style={s.modePickerLabel}>What would you like to record?</Text>
          <View style={s.modePicker}>
            <Pressable style={s.modeBtn} onPress={handleGalleryPick}>
              <Feather name="image" size={32} color={colors.primary} />
              <Text style={s.modeBtnText}>Photo</Text>
              <Text style={s.modeBtnSub}>Pick from gallery{"\n"}+ add a note</Text>
            </Pressable>
            <Pressable style={s.modeBtn} onPress={handleNoteMode}>
              <Feather name="file-text" size={32} color={colors.primary} />
              <Text style={s.modeBtnText}>Note</Text>
              <Text style={s.modeBtnSub}>Text or voice{"\n"}without a photo</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <KeyboardAwareScrollView
          style={s.scroll}
          contentContainerStyle={{
            paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 80,
          }}
        >
          {/* Photo section — only in photo mode */}
          {mode === "photo" && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>Photo</Text>
              {photo ? (
                <View style={{ gap: 10 }}>
                  <Image source={{ uri: photo.uri }} style={s.photoPreview} contentFit="cover" />
                  <Pressable style={s.changePhotoBtn} onPress={handleGalleryPick}>
                    <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
                    <Text style={s.changeBtnText}>Change photo</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}

          {/* Date section */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Date</Text>
            {hasExifDate ? (
              <View style={s.metaBox}>
                <View style={s.metaRow}>
                  <Feather name="calendar" size={14} color={colors.primary} />
                  <Text style={s.metaText}>
                    Photo taken: <Text style={s.metaHighlight}>{photo?.date}</Text>
                  </Text>
                </View>
                {photo?.lat && photo?.lng ? (
                  <View style={s.metaRow}>
                    <Feather name="map-pin" size={14} color={colors.primary} />
                    <Text style={s.metaText}>
                      GPS: <Text style={s.metaHighlight}>{photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}</Text>
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {mode === "photo" && (
                  <View style={s.warningBox}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
                    <Text style={s.warningText}>No date metadata found in this photo. Enter the date manually.</Text>
                  </View>
                )}
                <TextInput
                  style={s.dateInput}
                  value={manualDate}
                  onChangeText={setManualDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            )}
          </View>

          {/* Tag section */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Tag (optional)</Text>
            <View style={s.tagRow}>
              {knownTags.map((tag) => (
                <Pressable
                  key={tag}
                  style={[s.tagChip, selectedTag === tag && s.tagChipActive]}
                  onPress={() => handleSelectTag(tag)}
                >
                  <Text style={[s.tagChipText, selectedTag === tag && s.tagChipTextActive]}>
                    #{tag}
                  </Text>
                </Pressable>
              ))}
              {!showNewTagInput && (
                <Pressable style={s.addTagBtn} onPress={handleNewTagOpen}>
                  <Feather name="plus" size={13} color={colors.mutedForeground} />
                  <Text style={s.addTagBtnText}>New tag</Text>
                </Pressable>
              )}
            </View>
            {showNewTagInput && (
              <View style={s.newTagRow}>
                <TextInput
                  ref={newTagRef}
                  style={s.newTagInput}
                  value={newTagDraft}
                  onChangeText={setNewTagDraft}
                  placeholder="travel, family, work…"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={handleNewTagConfirm}
                  maxLength={30}
                />
                <Pressable style={s.newTagConfirm} onPress={handleNewTagConfirm}>
                  <Text style={s.newTagConfirmText}>Add</Text>
                </Pressable>
              </View>
            )}
            {selectedTag && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="info" size={12} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  Obsidian filename: {manualDate}.{selectedTag}.
                  {generateId().substring(0, 4)}
                </Text>
              </View>
            )}
          </View>

          {/* Note section */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Note</Text>
            <View style={s.noteContainer}>
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder={getNotePlaceholder(settings.voiceLanguage)}
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={2000}
              />
              <View style={s.noteToolbar}>
                <Pressable style={s.voiceBtn} onPress={handleVoiceOpen}>
                  <Feather name="mic" size={14} color={colors.primary} />
                  <Text style={s.voiceBtnText}>Dictate</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Obsidian hint */}
          <View style={s.obsidianHint}>
            <Feather
              name="circle"
              size={8}
              color={settings.configured ? colors.success : colors.mutedForeground}
            />
            <Text style={s.obsidianHintText}>
              {settings.configured
                ? `Will save to Obsidian vault: ${settings.vaultName}`
                : "Obsidian not configured — go to Settings to enable"}
            </Text>
          </View>
        </KeyboardAwareScrollView>
      )}
    </View>
  );
}
