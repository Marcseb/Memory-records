import { Feather, Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useAuth } from "@/context/AuthContext";
import { MemoryRecord, useRecords } from "@/context/RecordsContext";
import { VOICE_LANGUAGES, useSettings } from "@/context/SettingsContext";
import { useObsidian } from "@/hooks/useObsidian";
import { useColors } from "@/hooks/useColors";

type PhotoSource = "gallery" | "files" | null;

interface PhotoData {
  uri: string;
  source: PhotoSource;
  date?: string;
  hasMetadata: boolean;
  lat?: number;
  lng?: number;
  location?: string;
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

function getVoicePlaceholder(langCode: string): string {
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
    case "fr-FR": return "Tapez votre note, ou appuyez sur 🎤 sur le clavier pour dicter.";
    case "it-IT": return "Digitate la nota, o premete 🎤 sulla tastiera per dettare.";
    default:      return "Type your note, or tap 🎤 on your keyboard to dictate.";
  }
}

export default function NewRecordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { addRecord } = useRecords();
  const { settings } = useSettings();
  const { saveToObsidian } = useObsidian();

  const [photo, setPhoto] = useState<PhotoData | null>(null);
  const [note, setNote] = useState("");
  const [manualDate, setManualDate] = useState(todayString());
  const [isSaving, setIsSaving] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Voice modal state
  const [voiceModalVisible, setVoiceModalVisible] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState("");
  const voiceInputRef = useRef<TextInput>(null);

  const currentLang = VOICE_LANGUAGES.find((l) => l.code === settings.voiceLanguage) ?? VOICE_LANGUAGES[0];

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
    setPhoto({
      uri: asset.uri,
      source: "gallery",
      date: exifDate,
      hasMetadata: !!exifDate,
      lat,
      lng,
    });
    if (exifDate) setManualDate(exifDate);
  };

  const handleFilesPick = async () => {
    setLoadingFiles(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/jpg", "image/png", "image/heic", "image/webp", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPhoto({
        uri: asset.uri,
        source: "files",
        hasMetadata: false,
      });
    } catch (err) {
      console.warn("[Files]", err);
      Alert.alert("Error", "Could not open the image. Try again.");
    } finally {
      setLoadingFiles(false);
    }
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

  const handleSave = async () => {
    if (!photo) {
      Alert.alert("No Photo", "Please select a photo first.");
      return;
    }
    if (!note.trim()) {
      Alert.alert("No Note", "Please add a note before saving.");
      return;
    }
    setIsSaving(true);
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const record: MemoryRecord = {
      id: generateId(),
      imageUri: photo.uri,
      note: note.trim(),
      date: photo.date ?? manualDate,
      location: photo.location,
      lat: photo.lat,
      lng: photo.lng,
      savedToObsidian: false,
      createdAt: Date.now(),
    };

    await addRecord(record);

    if (settings.configured && user) {
      const result = await saveToObsidian(record, user.username);
      if (!result.ok && result.reason === "open_failed") {
        Alert.alert(
          "Cannot Open Obsidian",
          "Record saved locally. To send to Obsidian later, open the record and tap \"Save to Obsidian\".\n\n" +
            "Make sure Obsidian is installed with the Actions URI plugin enabled."
        );
      }
    }

    setIsSaving(false);
    router.back();
  };

  const hasDate = photo?.hasMetadata && !!photo.date;

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
    section: { padding: 16, gap: 10 },
    sectionLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    photoPickerRow: { flexDirection: "row", gap: 10 },
    pickBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
    },
    pickBtnText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    photoPreview: {
      width: "100%",
      height: 220,
      borderRadius: colors.radius,
      backgroundColor: colors.muted,
    },
    metaBox: {
      backgroundColor: colors.surface,
      borderRadius: colors.radius,
      padding: 12,
      gap: 4,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
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
      minHeight: 100,
      textAlignVertical: "top",
    },
    noteToolbar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      marginTop: 8,
    },
    langPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    langPillText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    voiceBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 10,
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
    modalBtnRow: {
      flexDirection: "row",
      gap: 10,
    },
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
            <Text style={s.modalTitle}>
              {currentLang.flag} {getDictateLabel(settings.voiceLanguage)}
            </Text>
            <Text style={s.modalHint}>
              {getDictateHint(settings.voiceLanguage)}
            </Text>
            <TextInput
              ref={voiceInputRef}
              style={s.modalInput}
              value={voiceDraft}
              onChangeText={setVoiceDraft}
              placeholder={getVoicePlaceholder(settings.voiceLanguage)}
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

      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={s.headerTitle}>New Memory</Text>
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
      </View>

      <KeyboardAwareScrollView
        style={s.scroll}
        contentContainerStyle={{
          paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 80,
        }}
      >
        {/* Photo picker */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Photo</Text>
          {!photo ? (
            <View style={s.photoPickerRow}>
              <Pressable style={s.pickBtn} onPress={handleGalleryPick}>
                <Feather name="image" size={18} color={colors.primary} />
                <Text style={s.pickBtnText}>Gallery</Text>
              </Pressable>
              <Pressable style={s.pickBtn} onPress={handleFilesPick} disabled={loadingFiles}>
                {loadingFiles ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Feather name="folder" size={18} color={colors.primary} />
                    <Text style={s.pickBtnText}>Files</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Image source={{ uri: photo.uri }} style={s.photoPreview} contentFit="cover" />
              <Pressable
                style={[s.pickBtn, { flex: 0 }]}
                onPress={() => {
                  setPhoto(null);
                  setManualDate(todayString());
                }}
              >
                <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
                <Text style={[s.pickBtnText, { color: colors.mutedForeground }]}>Change photo</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Date */}
        {photo && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Date</Text>
            {hasDate ? (
              <View style={s.metaBox}>
                <View style={s.metaRow}>
                  <Feather name="calendar" size={14} color={colors.primary} />
                  <Text style={s.metaText}>
                    Photo taken:{" "}
                    <Text style={s.metaHighlight}>{photo.date}</Text>
                  </Text>
                </View>
                {photo.lat && photo.lng ? (
                  <View style={s.metaRow}>
                    <Feather name="map-pin" size={14} color={colors.primary} />
                    <Text style={s.metaText}>
                      GPS:{" "}
                      <Text style={s.metaHighlight}>
                        {photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}
                      </Text>
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={s.warningBox}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
                  <Text style={s.warningText}>
                    No date metadata found. Enter the date manually (YYYY-MM-DD).
                  </Text>
                </View>
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
        )}

        {/* Note + voice */}
        {photo && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>Note or Comment</Text>
            <View style={s.noteContainer}>
              <TextInput
                style={s.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder={getVoicePlaceholder(settings.voiceLanguage)}
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={2000}
              />
              <View style={s.noteToolbar}>
                <View style={s.langPill}>
                  <Text style={{ fontSize: 14 }}>{currentLang.flag}</Text>
                  <Text style={s.langPillText}>{currentLang.label}</Text>
                </View>
                <Pressable style={s.voiceBtn} onPress={handleVoiceOpen}>
                  <Feather name="mic" size={15} color={colors.primary} />
                  <Text style={s.voiceBtnText}>Dictate</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Obsidian hint */}
        {photo && (
          <View style={s.obsidianHint}>
            <Feather
              name="circle"
              size={8}
              color={settings.configured ? colors.success : colors.mutedForeground}
            />
            <Text style={s.obsidianHintText}>
              {settings.configured
                ? `Will save text note to Obsidian vault: ${settings.vaultName}`
                : "Obsidian not configured — go to Settings to enable"}
            </Text>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
