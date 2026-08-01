import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { deleteAppVideo } from "@/utils/storage";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import { EmotionPicker } from "@/components/EmotionPicker";
import { MemoryRecord, useRecords } from "@/context/RecordsContext";
import { useSettings } from "@/context/SettingsContext";
import { useInterview, ContextNote } from "@/hooks/useInterview";
import { useColors } from "@/hooks/useColors";
import { useUnlock } from "@/context/UnlockContext";
import { UnlockModal } from "@/components/UnlockModal";

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

/** Extract a YYYY-MM-DD date from a camera-style video filename.
 *  Handles patterns like VID_20220315_143022.mp4 or 20221015_080000.MOV */
function parseDateFromVideoFilename(fileName: string | null | undefined, uri?: string): string | undefined {
  const name = fileName ?? uri?.split("/").pop() ?? "";
  const match = name.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);
  const currentYear = new Date().getFullYear();
  if (y < 1990 || y > currentYear + 1) return undefined;
  if (m < 1 || m > 12) return undefined;
  if (d < 1 || d > 31) return undefined;
  return `${year}-${month}-${day}`;
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
  const { records, addRecord, knownTags, addTag } = useRecords();
  const { settings } = useSettings();

  // Context passed from an existing record's "New note" button
  const { fromContext } = useLocalSearchParams<{ fromContext?: string }>();
  const [contextNote, setContextNote] = useState<string | undefined>(undefined);

  const [mode, setMode] = useState<"photo" | "note" | null>(null);
  const [photo, setPhoto] = useState<PhotoData | null>(null);
  const [video, setVideo] = useState<{ uri: string; thumbnailUri: string | null; date?: string } | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [note, setNote] = useState("");
  const [manualDate, setManualDate] = useState(todayString());
  const [contextYear, setContextYear] = useState<number | undefined>(undefined);
  const [yearInputActive, setYearInputActive] = useState(false);
  const [yearInputText, setYearInputText] = useState("");
  const yearInputRef = useRef<TextInput>(null);
  const [isSaving, setIsSaving] = useState(false);
  const currentYear = new Date().getFullYear();

  const commitYearInput = () => {
    const parsed = parseInt(yearInputText, 10);
    if (!isNaN(parsed) && parsed >= 1900 && parsed <= currentYear) {
      setContextYear(parsed);
    }
    setYearInputActive(false);
    setYearInputText("");
  };
  const [savedBanner, setSavedBanner] = useState(false);

  // Emotion state
  const [selectedEmotion, setSelectedEmotion] = useState("neutral");

  // Tag state — ordered array; index 0 is the primary tag (drives filename)
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagDraft, setNewTagDraft] = useState("");
  const newTagRef = useRef<TextInput>(null);

  // Unlock gate
  const { isAiUnlocked } = useUnlock();
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  // Interview state
  const [interviewEnabled, setInterviewEnabled] = useState(false);
  const [contextNotes, setContextNotes] = useState<ContextNote[]>([]);
  const [showContextPicker, setShowContextPicker] = useState(false);
  const { question, isLoading: interviewLoading, error: interviewError, startInterview, nextQuestion, reset: resetInterview } = useInterview();

  // Auto-initialize when arriving from an existing record's "New note" button
  useEffect(() => {
    if (fromContext !== "1") return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("mr_temp_context");
        await AsyncStorage.removeItem("mr_temp_context");
        if (!raw) return;
        const { note: ctxNote, tags: ctxTags, contextYear: ctxYear } = JSON.parse(raw) as {
          note: string;
          tags: string[];
          contextYear?: number;
        };
        setContextNote(ctxNote);
        setMode("note");
        if (ctxTags.length > 0) setSelectedTags(ctxTags);
        if (ctxYear !== undefined) setContextYear(ctxYear);
        // Do NOT auto-start the interview — leave it off so the user can
        // pick context notes first, then tap "Start interview" manually.
      } catch {
        // if anything fails, just open a blank note screen
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

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
    setVideo(null);
    setManualDate(todayString());
    setMode("note");
  };

  const handleVideoPick = async () => {
    if (!isAiUnlocked) {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setShowUnlockModal(true);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Allow access to your photo library to pick videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setVideoLoading(true);
    setMode("photo");
    setPhoto(null);

    // If the user is replacing an already-picked video, delete the old copy.
    if (video?.uri) {
      await deleteAppVideo(video.uri);
      setVideo(null);
    }

    try {
      const asset = result.assets[0];
      const ext = (asset.uri.split(".").pop() ?? "mp4").split("?")[0];
      const destUri = `${FileSystem.documentDirectory ?? ""}video_${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: asset.uri, to: destUri });

      let thumbnailUri: string | null = null;
      try {
        const { getThumbnailAsync } = await import("expo-video-thumbnails");
        const thumb = await getThumbnailAsync(destUri, { time: 0, quality: 0.7 });
        thumbnailUri = thumb.uri;
      } catch {
        /* thumbnail optional — play-icon fallback shown */
      }

      // Try to get the actual recording date — two strategies in order of reliability
      let videoDate: string | undefined;

      // 1. MediaStore creationTime via expo-media-library (SDK-54-compatible, ~18.2.1).
      //    Asset ID sources:
      //    • assetId field  — populated on iOS, null on Android
      //    • content:// URI tail — Android direct picker
      //    • Pure-numeric filename stem — Expo Go on Android caches the video and names
      //      it with the MediaStore ID (e.g. "1000048306.mp4")
      try {
        let assetRef: string | null = asset.assetId ?? null;
        if (!assetRef && asset.uri.startsWith("content://")) {
          const tail = asset.uri.split("/").pop() ?? "";
          if (/^\d+$/.test(tail)) assetRef = tail;
        }
        if (!assetRef) {
          const base = (asset.fileName ?? "").replace(/\.[^.]+$/, "");
          if (/^\d+$/.test(base)) assetRef = base;
        }
        if (assetRef) {
          const MediaLibrary = await import("expo-media-library");
          const { status } = await MediaLibrary.requestPermissionsAsync(/* writeOnly= */ false);
          if (status !== "granted") throw new Error("Permission denied");
          const info = await MediaLibrary.getAssetInfoAsync(assetRef);
          if (info.creationTime) {
            // Normalise: SDK returns seconds on some platforms, ms on others
            const ms = info.creationTime > 1e11 ? info.creationTime : info.creationTime * 1000;
            const d = new Date(ms);
            if (d.getFullYear() >= 1990 && d.getFullYear() <= new Date().getFullYear() + 1) {
              videoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            }
          }
        }
      } catch {
        /* silent — fall through to filename strategy */
      }

      // 2. Parse date from filename (VID_20220315_143022.mp4 style).
      //    Fallback for when MediaLibrary isn't available or assetRef can't be resolved.
      if (!videoDate) {
        videoDate = parseDateFromVideoFilename(asset.fileName, asset.uri);
      }

      setVideo({ uri: destUri, thumbnailUri, date: videoDate });
      if (videoDate) setManualDate(videoDate);
    } catch {
      Alert.alert("Error", "Could not load video. Please try again.");
      setMode(null);
    } finally {
      setVideoLoading(false);
    }
  };

  const handleSelectTag = (tag: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    setShowNewTagInput(false);
    setNewTagDraft("");
  };

  const handleNewTagOpen = () => {
    setShowNewTagInput(true);
    setTimeout(() => newTagRef.current?.focus(), 100);
  };

  const handleNewTagConfirm = () => {
    const tag = normalizeTag(newTagDraft);
    if (tag) {
      addTag(tag);
      setSelectedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    }
    setShowNewTagInput(false);
    setNewTagDraft("");
  };

  const handleToggleInterview = async () => {
    if (!isAiUnlocked) {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      setShowUnlockModal(true);
      return;
    }
    if (Platform.OS !== "web") Haptics.selectionAsync();
    if (!interviewEnabled) {
      setInterviewEnabled(true);
      await startInterview(selectedTags, contextNote ?? undefined, contextNotes);
    } else {
      setInterviewEnabled(false);
      resetInterview();
    }
  };

  const handleOpenContextPicker = () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setShowContextPicker(true);
  };

  const handleToggleContextNote = (rec: MemoryRecord) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setContextNotes((prev) => {
      const exists = prev.some((n) => n.note === rec.note && n.date === rec.date);
      if (exists) return prev.filter((n) => !(n.note === rec.note && n.date === rec.date));
      if (prev.length >= 3) return prev; // max 3
      const cn: ContextNote = {
        note: rec.note,
        date: rec.date,
        tags: rec.tags,
        contextYear: rec.contextYear,
        emotion: rec.emotion,
      };
      return [...prev, cn];
    });
  };

  const handleNextQuestion = async () => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    await nextQuestion(note, selectedTags);
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
    setVideo(null);
    setVideoLoading(false);
    setNote("");
    setManualDate(todayString());
    setContextYear(undefined);
    setSelectedEmotion("neutral");
    setSelectedTags([]);
    setShowNewTagInput(false);
    setNewTagDraft("");
    setInterviewEnabled(false);
    setContextNotes([]);
    resetInterview();
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
      videoUri: video?.uri,
      videoThumbnailUri: video?.thumbnailUri ?? undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      emotion: selectedEmotion,
      note: note.trim(),
      date: photo?.date ?? manualDate,
      contextYear: contextYear,
      location: undefined,
      lat: photo?.lat,
      lng: photo?.lng,
      savedToObsidian: false,
      createdAt: Date.now(),
    };

    await addRecord(record);

    setIsSaving(false);

    // If an interview is in progress, stay on screen so the conversation
    // continues — just clear the note and show a brief confirmation.
    if (interviewEnabled) {
      setNote("");
      setSavedBanner(true);
      setTimeout(() => setSavedBanner(false), 2500);
    } else {
      router.back();
    }
  };

  const hasExifDate = photo?.hasMetadata && !!photo.date;
  const hasVideoDate = !!video?.date;
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
    modeBtnLockBadge: {
      position: "absolute",
      top: -4,
      right: -6,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
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
    videoPlayOverlay: {
      position: "absolute",
      top: 0, left: 0, right: 0, bottom: 0,
      alignItems: "center",
      justifyContent: "center",
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
    yearStepperRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: colors.radius,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    yearStepperLabel: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      flex: 1,
    },
    yearStepperControls: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    yearStepperBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    yearStepperValue: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      minWidth: 46,
      textAlign: "center",
    },
    yearStepperValueEmpty: {
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    yearInputField: {
      minWidth: 46,
      textAlign: "center",
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      borderBottomWidth: 1.5,
      borderBottomColor: colors.primary,
      paddingBottom: 2,
      paddingHorizontal: 4,
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
    tagOrderBadge: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    tagOrderBadgeText: {
      fontSize: 10,
      fontFamily: "Inter_700Bold",
      color: colors.primaryForeground,
      lineHeight: 12,
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
    // Interview section
    interviewHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    interviewToggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.primary + "12",
    },
    interviewToggleBtnOff: {
      borderColor: colors.border,
      backgroundColor: "transparent",
    },
    interviewToggleText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    interviewToggleTextOff: {
      color: colors.mutedForeground,
    },
    interviewBubble: {
      backgroundColor: colors.primary + "10",
      borderRadius: colors.radius,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      padding: 14,
      gap: 4,
    },
    interviewBubbleLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    interviewBubbleText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 22,
    },
    interviewBubbleError: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      lineHeight: 20,
    },
    interviewActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 10,
    },
    interviewNextBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
      backgroundColor: colors.primary,
    },
    interviewNextBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    interviewHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      fontStyle: "italic",
    },
    contextBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: colors.accent + "12",
      borderBottomWidth: 1,
      borderBottomColor: colors.accent + "28",
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    contextBannerText: {
      flex: 1,
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.accent,
      lineHeight: 17,
    },
    savedBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.success + "18",
      borderBottomWidth: 1,
      borderBottomColor: colors.success + "30",
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    savedBannerText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.success,
    },
    // Context notes picker
    contextPickerOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    contextPickerSheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: Platform.OS === "web" ? 32 : insets.bottom + 24,
      maxHeight: "75%",
    },
    contextPickerHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    contextPickerTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 4,
    },
    contextPickerSub: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 14,
      lineHeight: 18,
    },
    contextPickerItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    contextPickerItemSelected: {
      backgroundColor: colors.primary + "08",
      borderRadius: colors.radius,
      paddingHorizontal: 8,
    },
    contextPickerCheckbox: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
      flexShrink: 0,
    },
    contextPickerCheckboxActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    contextPickerItemMeta: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 3,
    },
    contextPickerItemText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 18,
    },
    contextPickerDoneBtn: {
      marginTop: 14,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
      paddingVertical: 13,
      alignItems: "center",
    },
    contextPickerDoneText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    contextNoteChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    contextNoteChipText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      maxWidth: 160,
    },
    addContextBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: "dashed",
    },
    addContextBtnText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
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
      {/* Context notes picker modal */}
      <Modal
        visible={showContextPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowContextPicker(false)}
      >
        <Pressable style={s.contextPickerOverlay} onPress={() => setShowContextPicker(false)}>
          <Pressable style={s.contextPickerSheet} onPress={Keyboard.dismiss}>
            <View style={s.contextPickerHandle} />
            <Text style={s.contextPickerTitle}>Add context notes</Text>
            <Text style={s.contextPickerSub}>
              Select up to 3 existing memories to give the interviewer broader context.
              {contextNotes.length === 3 ? " (Maximum reached)" : ` ${3 - contextNotes.length} remaining`}
            </Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {records
                .filter((r) => r.note && r.note.trim().length > 0)
                .map((rec) => {
                  const isSelected = contextNotes.some(
                    (n) => n.note === rec.note && n.date === rec.date
                  );
                  const isDisabled = !isSelected && contextNotes.length >= 3;
                  const metaParts: string[] = [rec.date];
                  if (rec.contextYear !== undefined) metaParts.push(String(rec.contextYear));
                  if (rec.tags?.length) metaParts.push(rec.tags.map((t) => `#${t}`).join(" "));
                  return (
                    <Pressable
                      key={rec.id}
                      style={[s.contextPickerItem, isSelected && s.contextPickerItemSelected]}
                      onPress={() => !isDisabled && handleToggleContextNote(rec)}
                      disabled={isDisabled}
                    >
                      <View style={[s.contextPickerCheckbox, isSelected && s.contextPickerCheckboxActive]}>
                        {isSelected && <Feather name="check" size={12} color={colors.primaryForeground} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.contextPickerItemMeta, isDisabled && { opacity: 0.4 }]}>
                          {metaParts.join(" · ")}
                        </Text>
                        <Text
                          style={[s.contextPickerItemText, isDisabled && { opacity: 0.4 }]}
                          numberOfLines={2}
                        >
                          {rec.note}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
            </ScrollView>
            <Pressable style={s.contextPickerDoneBtn} onPress={() => setShowContextPicker(false)}>
              <Text style={s.contextPickerDoneText}>
                Done{contextNotes.length > 0 ? ` · ${contextNotes.length} selected` : ""}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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
              <Text style={s.saveBtnText}>{interviewEnabled ? "Save note" : "Save"}</Text>
            )}
          </Pressable>
        )}
      </View>

      {/* Saved confirmation banner — shown during interview after each save */}
      {savedBanner && (
        <View style={s.savedBanner}>
          <Feather name="check-circle" size={15} color={colors.success} />
          <Text style={s.savedBannerText}>Note saved — interview continues below</Text>
        </View>
      )}

      {/* Context banner — shown when continuing from an existing record */}
      {contextNote ? (
        <View style={s.contextBanner}>
          <Feather name="link" size={13} color={colors.accent} style={{ marginTop: 1 }} />
          <Text style={s.contextBannerText} numberOfLines={2}>
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>Continuing from: </Text>
            {contextNote.length > 100 ? contextNote.slice(0, 97) + "…" : contextNote}
          </Text>
        </View>
      ) : null}

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
            <Pressable style={s.modeBtn} onPress={handleVideoPick}>
              <View>
                <Feather name="video" size={32} color={isAiUnlocked ? colors.primary : colors.mutedForeground} />
                {!isAiUnlocked && (
                  <View style={s.modeBtnLockBadge}>
                    <Feather name="lock" size={9} color={colors.primaryForeground} />
                  </View>
                )}
              </View>
              <Text style={[s.modeBtnText, !isAiUnlocked && { color: colors.mutedForeground }]}>Video</Text>
              <Text style={s.modeBtnSub}>Pick a clip{"\n"}+ add a note</Text>
            </Pressable>
            <Pressable style={s.modeBtn} onPress={handleNoteMode}>
              <Feather name="file-text" size={32} color={colors.primary} />
              <Text style={s.modeBtnText}>Note</Text>
              <Text style={s.modeBtnSub}>Text or voice{"\n"}without media</Text>
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
          {/* Photo / Video section — only in photo mode */}
          {mode === "photo" && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>{video ? "Video" : "Photo"}</Text>
              {photo ? (
                <View style={{ gap: 10 }}>
                  <Image source={{ uri: photo.uri }} style={s.photoPreview} contentFit="cover" />
                  <Pressable style={s.changePhotoBtn} onPress={handleGalleryPick}>
                    <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
                    <Text style={s.changeBtnText}>Change photo</Text>
                  </Pressable>
                </View>
              ) : video ? (
                <View style={{ gap: 10 }}>
                  {videoLoading ? (
                    <View style={[s.photoPreview, { alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }]}>
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : video.thumbnailUri ? (
                    <View>
                      <Image source={{ uri: video.thumbnailUri }} style={s.photoPreview} contentFit="cover" />
                      <View style={s.videoPlayOverlay}>
                        <Feather name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
                      </View>
                    </View>
                  ) : (
                    <View style={[s.photoPreview, { alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }]}>
                      <Feather name="video" size={40} color={colors.mutedForeground} />
                    </View>
                  )}
                  <Pressable style={s.changePhotoBtn} onPress={handleVideoPick}>
                    <Feather name="refresh-cw" size={16} color={colors.mutedForeground} />
                    <Text style={s.changeBtnText}>Change video</Text>
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
            ) : hasVideoDate ? (
              <View style={s.metaBox}>
                <View style={s.metaRow}>
                  <Feather name="video" size={14} color={colors.primary} />
                  <Text style={s.metaText}>
                    Video recorded: <Text style={s.metaHighlight}>{video?.date}</Text>
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {mode === "photo" && (
                  <View style={s.warningBox}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
                    <Text style={s.warningText}>
                      {video ? "No date metadata found for this video." : "No date metadata found in this photo."} Enter the date manually.
                    </Text>
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

            {/* Memory year stepper */}
            <View style={s.yearStepperRow}>
              <Feather name="clock" size={13} color={colors.mutedForeground} style={{ marginTop: 1 }} />
              <Text style={s.yearStepperLabel}>Memory year</Text>
              <View style={s.yearStepperControls}>
                <Pressable
                  style={s.yearStepperBtn}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    setContextYear((y) => y !== undefined ? Math.max(1900, y - 1) : currentYear - 1);
                  }}
                >
                  <Feather name="minus" size={14} color={colors.foreground} />
                </Pressable>
                {yearInputActive ? (
                  <TextInput
                    ref={yearInputRef}
                    style={s.yearInputField}
                    value={yearInputText}
                    onChangeText={setYearInputText}
                    keyboardType="number-pad"
                    maxLength={4}
                    returnKeyType="done"
                    onSubmitEditing={commitYearInput}
                    onBlur={commitYearInput}
                    autoFocus
                  />
                ) : (
                  <Pressable
                    onPress={() => {
                      setYearInputText(contextYear ? String(contextYear) : "");
                      setYearInputActive(true);
                      setTimeout(() => yearInputRef.current?.focus(), 50);
                    }}
                    hitSlop={6}
                  >
                    <Text style={[s.yearStepperValue, !contextYear && s.yearStepperValueEmpty]}>
                      {contextYear ? String(contextYear) : "—"}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  style={s.yearStepperBtn}
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    setContextYear((y) => y !== undefined ? Math.min(currentYear, y + 1) : currentYear);
                  }}
                >
                  <Feather name="plus" size={14} color={colors.foreground} />
                </Pressable>
              </View>
              {contextYear !== undefined && (
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    setContextYear(undefined);
                  }}
                  hitSlop={8}
                >
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </Pressable>
              )}
            </View>
          </View>

          {/* Tag section */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Tags (optional)</Text>
            <View style={s.tagRow}>
              {knownTags.map((tag) => {
                const orderIndex = selectedTags.indexOf(tag);
                const isSelected = orderIndex !== -1;
                return (
                  <Pressable
                    key={tag}
                    style={[s.tagChip, isSelected && s.tagChipActive]}
                    onPress={() => handleSelectTag(tag)}
                  >
                    {isSelected && (
                      <View style={s.tagOrderBadge}>
                        <Text style={s.tagOrderBadgeText}>{orderIndex + 1}</Text>
                      </View>
                    )}
                    <Text style={[s.tagChipText, isSelected && s.tagChipTextActive]}>
                      #{tag}
                    </Text>
                  </Pressable>
                );
              })}
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
            {selectedTags.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="info" size={12} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  Filename uses first tag: <Text style={{ fontFamily: "Inter_500Medium" }}>{selectedTags[0]}</Text>
                  {selectedTags.length > 1 && `  ·  all tags saved in note`}
                </Text>
              </View>
            )}
          </View>

          {/* Emotion section */}
          <View style={s.section}>
            <Text style={s.sectionLabel}>Emotion (optional)</Text>
            <EmotionPicker value={selectedEmotion} onChange={setSelectedEmotion} />
          </View>

          {/* AI Interviewer section */}
          <View style={s.section}>
            <View style={s.interviewHeader}>
              <Text style={s.sectionLabel}>AI Interviewer</Text>
              <Pressable
                style={[s.interviewToggleBtn, !interviewEnabled && s.interviewToggleBtnOff]}
                onPress={handleToggleInterview}
                disabled={interviewLoading}
              >
                <Feather
                  name={interviewEnabled ? "zap" : "zap-off"}
                  size={13}
                  color={interviewEnabled ? colors.primary : colors.mutedForeground}
                />
                <Text style={[s.interviewToggleText, !interviewEnabled && s.interviewToggleTextOff]}>
                  {interviewEnabled ? "On" : "Start interview"}
                </Text>
              </Pressable>
            </View>

            {/* Context notes — shown before and after starting interview */}
            {!interviewEnabled && records.filter((r) => r.note?.trim()).length > 0 && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Feather name="layers" size={12} color={colors.mutedForeground} />
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                      Context notes for interview{contextNotes.length > 0 ? ` (${contextNotes.length}/3)` : " (optional)"}
                    </Text>
                  </View>
                  <Pressable style={s.addContextBtn} onPress={handleOpenContextPicker}>
                    <Feather name="plus" size={12} color={colors.mutedForeground} />
                    <Text style={s.addContextBtnText}>
                      {contextNotes.length === 0 ? "Add context" : contextNotes.length < 3 ? "Add more" : "Edit"}
                    </Text>
                  </Pressable>
                </View>
                {contextNotes.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {contextNotes.map((cn, i) => (
                      <View key={i} style={s.contextNoteChip}>
                        <Feather name="file-text" size={11} color={colors.mutedForeground} />
                        <Text style={s.contextNoteChipText} numberOfLines={1}>
                          {cn.date}{cn.tags?.length ? ` · #${cn.tags[0]}` : ""}
                        </Text>
                        <Pressable
                          hitSlop={8}
                          onPress={() => {
                            if (Platform.OS !== "web") Haptics.selectionAsync();
                            setContextNotes((prev) => prev.filter((_, j) => j !== i));
                          }}
                        >
                          <Feather name="x" size={12} color={colors.mutedForeground} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
                {contextNotes.length === 0 && (
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontStyle: "italic" }}>
                    Pick up to 3 past memories to give the AI broader background for its questions.
                  </Text>
                )}
              </View>
            )}

            {interviewEnabled && contextNotes.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <Feather name="layers" size={12} color={colors.primary} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  Context:
                </Text>
                {contextNotes.map((cn, i) => (
                  <View key={i} style={{ backgroundColor: colors.primary + "14", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: colors.primary }}>
                      {cn.date}{cn.tags?.length ? ` · #${cn.tags[0]}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {interviewEnabled && selectedTags.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <Feather name="target" size={12} color={colors.primary} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                  Focused on:
                </Text>
                {selectedTags.map((tag) => (
                  <View key={tag} style={{ backgroundColor: colors.primary + "18", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.primary }}>#{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {interviewEnabled && selectedTags.length === 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="info" size={12} color={colors.mutedForeground} />
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, fontStyle: "italic" }}>
                  Select tags above to focus questions on a specific topic
                </Text>
              </View>
            )}

            {interviewEnabled && (
              <View style={{ gap: 10 }}>
                {interviewLoading ? (
                  <View style={s.interviewBubble}>
                    <Text style={s.interviewBubbleLabel}>Interviewer</Text>
                    <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: "flex-start", marginTop: 4 }} />
                  </View>
                ) : interviewError ? (
                  <View style={[s.interviewBubble, { borderLeftColor: colors.destructive, backgroundColor: colors.destructive + "10" }]}>
                    <Text style={[s.interviewBubbleLabel, { color: colors.destructive }]}>Error</Text>
                    <Text style={s.interviewBubbleError}>{interviewError}</Text>
                  </View>
                ) : question ? (
                  <View style={s.interviewBubble}>
                    <Text style={s.interviewBubbleLabel}>Interviewer</Text>
                    <Text style={s.interviewBubbleText}>{question}</Text>
                  </View>
                ) : null}

                {question && !interviewLoading && (
                  <View style={s.interviewActions}>
                    <Text style={s.interviewHint}>Answer below, then tap for a follow-up</Text>
                    <Pressable style={s.interviewNextBtn} onPress={handleNextQuestion}>
                      <Feather name="chevron-right" size={14} color={colors.primaryForeground} />
                      <Text style={s.interviewNextBtnText}>Next question</Text>
                    </Pressable>
                  </View>
                )}
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

      <UnlockModal
        visible={showUnlockModal}
        featureName="AI Interviewer"
        onClose={() => setShowUnlockModal(false)}
        onUnlocked={async () => {
          setInterviewEnabled(true);
          await startInterview(selectedTags, contextNote ?? undefined, contextNotes);
        }}
      />
    </View>
  );
}
