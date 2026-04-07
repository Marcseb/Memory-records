import { Feather, Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as ExpoSpeech from "expo-speech";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { MemoryRecord, useRecords } from "@/context/RecordsContext";
import { VOICE_LANGUAGES, useSettings } from "@/context/SettingsContext";
import { useObsidian } from "@/hooks/useObsidian";
import { useColors } from "@/hooks/useColors";

type PhotoSource = "gallery" | "clipboard" | null;

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
    case "fr-FR": return "Dictez votre note ici...";
    case "it-IT": return "Dettate la vostra nota qui...";
    default:      return "Dictate your note here...";
  }
}

function getVoicePromptLabel(langCode: string): string {
  switch (langCode) {
    case "fr-FR": return "Note vocale";
    case "it-IT": return "Nota vocale";
    default:      return "Voice note";
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
  const [isListening, setIsListening] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingClipboard, setLoadingClipboard] = useState(false);
  const stopListeningRef = useRef(false);

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
    const lat = typeof asset.exif?.["GPSLatitude"] === "number" ? asset.exif["GPSLatitude"] as number : undefined;
    const lng = typeof asset.exif?.["GPSLongitude"] === "number" ? asset.exif["GPSLongitude"] as number : undefined;
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

  const handleClipboardPaste = async () => {
    setLoadingClipboard(true);
    try {
      const hasImage = await Clipboard.hasImageAsync();
      if (!hasImage) {
        Alert.alert("No Image", "No image found in your clipboard. Copy an image first, then paste here.");
        return;
      }
      const base64 = await Clipboard.getImageAsync({ format: "jpeg" });
      if (!base64?.data) {
        Alert.alert("Error", "Could not read image from clipboard.");
        return;
      }
      const uri = `data:image/jpeg;base64,${base64.data}`;
      setPhoto({ uri, source: "clipboard", hasMetadata: false });
    } catch {
      Alert.alert("Error", "Failed to paste image from clipboard.");
    } finally {
      setLoadingClipboard(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (isListening) {
      stopListeningRef.current = true;
      setIsListening(false);
      return;
    }

    if (Platform.OS === "web") {
      Alert.alert(
        "Voice not available",
        "Voice recognition is not available on web. Please type your note.",
      );
      return;
    }

    setIsListening(true);
    stopListeningRef.current = false;
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const available = await ExpoSpeech.isSpeakingAsync();
      void available;

      const langLabel = getVoicePromptLabel(settings.voiceLanguage);

      Alert.prompt(
        langLabel,
        `Language: ${currentLang.flag} ${currentLang.label}\n\nType or dictate your note:`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => setIsListening(false),
          },
          {
            text: "Add",
            onPress: (text) => {
              if (text?.trim()) {
                setNote((prev) => (prev ? prev + " " + text.trim() : text.trim()));
              }
              setIsListening(false);
            },
          },
        ],
        "plain-text",
        note,
      );
    } catch {
      setIsListening(false);
    }

    setIsListening(false);
  };

  const handleSave = async () => {
    if (!photo) {
      Alert.alert("No Photo", "Please select a photo first.");
      return;
    }
    if (!note.trim()) {
      Alert.alert("No Note", "Please add a note or voice comment.");
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
      const saved = await saveToObsidian(record, user.username);
      if (saved) {
        await new Promise((res) => setTimeout(res, 500));
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
    },
    voiceBtnActive: { backgroundColor: colors.destructive + "20" },
    voiceBtnText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
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
  });

  return (
    <View style={s.container}>
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
              <Pressable style={s.pickBtn} onPress={handleClipboardPaste} disabled={loadingClipboard}>
                {loadingClipboard ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Feather name="clipboard" size={18} color={colors.primary} />
                    <Text style={s.pickBtnText}>Paste</Text>
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
                    This photo has no date metadata. Please enter the date manually (YYYY-MM-DD).
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
                {/* Current language indicator */}
                <View style={s.langPill}>
                  <Text style={{ fontSize: 14 }}>{currentLang.flag}</Text>
                  <Text style={s.langPillText}>{currentLang.label}</Text>
                </View>

                {/* Voice button */}
                <Pressable
                  style={[s.voiceBtn, isListening && s.voiceBtnActive]}
                  onPress={handleVoiceToggle}
                >
                  <Feather
                    name={isListening ? "mic-off" : "mic"}
                    size={15}
                    color={isListening ? colors.destructive : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      s.voiceBtnText,
                      { color: isListening ? colors.destructive : colors.mutedForeground },
                    ]}
                  >
                    {isListening ? "Stop" : "Voice"}
                  </Text>
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
                ? `Will save to Obsidian vault: ${settings.vaultName}`
                : "Obsidian not configured — go to Settings to enable"}
            </Text>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}
