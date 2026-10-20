import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import {
  copyImageToAppStorage,
  copyThumbnailToAppStorage,
  copyVideoToAppStorage,
  deleteAppVideo,
  deleteAppAudio,
} from "@/utils/storage";
import { VideoPlayerModal } from "@/components/VideoPlayerModal";
import { PhotoViewerModal } from "@/components/PhotoViewerModal";
import { VoiceMemoRecorder } from "@/components/VoiceMemoRecorder";
import { VoiceMemoPlayer } from "@/components/VoiceMemoPlayer";
import {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
  ShareCard,
} from "@/components/ShareCard";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
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
import { useHistoricalEvents } from "@/hooks/useHistoricalEvents";
import { useColors } from "@/hooks/useColors";
import { useUnlock } from "@/context/UnlockContext";
import { UnlockModal } from "@/components/UnlockModal";
import { EmotionPicker } from "@/components/EmotionPicker";
import { getEmotion } from "@/constants/emotions";

export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { records, updateRecord, deleteRecord, addRecord, knownTags } = useRecords();
  const { settings } = useSettings();
  const { saveToObsidian } = useObsidian();
  const { generate: generateEvents, isLoading: generatingEvents } = useHistoricalEvents();
  const { isPremiumUnlocked } = useUnlock();
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockFeatureName, setUnlockFeatureName] = useState("Historical Events");
  const [saving, setSaving] = useState(false);
  const [videoModalUri, setVideoModalUri] = useState<string | null>(null);
  const [photoModalUri, setPhotoModalUri] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedNote, setEditedNote] = useState("");
  const [editedYear, setEditedYear] = useState<number | undefined>(undefined);
  const [yearInputActive, setYearInputActive] = useState(false);
  const [yearInputText, setYearInputText] = useState("");
  const yearInputRef = useRef<TextInput>(null);
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [editedEmotion, setEditedEmotion] = useState("neutral");
  const [editedAudioUri, setEditedAudioUri] = useState<string | undefined>(undefined);
  const [isSharing, setIsSharing] = useState(false);
  const shareCardRef = useRef<ViewShotRef>(null);
  const editInputRef = useRef<TextInput>(null);
  const currentYear = new Date().getFullYear();
  const requestUnlock = (featureName: string) => {
    setUnlockFeatureName(featureName);
    setShowUnlockModal(true);
  };

  const commitYearInput = () => {
    const parsed = parseInt(yearInputText, 10);
    if (!isNaN(parsed) && parsed >= 1900 && parsed <= currentYear) {
      setEditedYear(parsed);
    }
    setYearInputActive(false);
    setYearInputText("");
  };

  const record = records.find((r) => r.id === id);

  useEffect(() => {
    if (!record?.videoUri || record.videoThumbnailUri) return;
    let cancelled = false;

    (async () => {
      try {
        const { getThumbnailAsync } = await import("expo-video-thumbnails");
        const thumbnail = await getThumbnailAsync(record.videoUri!, { time: 0, quality: 0.7 });
        let thumbnailUri = thumbnail.uri;
        try {
          thumbnailUri = await copyThumbnailToAppStorage(thumbnail.uri);
        } catch {
          // Expo Go can display VideoThumbnails cache files even when
          // Expo FileSystem refuses permission to copy them.
        }
        if (!cancelled) {
          await updateRecord(record.id, { videoThumbnailUri: thumbnailUri });
        }
      } catch (error) {
        console.warn("Video thumbnail repair failed", error);
        // Thumbnail repair is optional; keep the restored video playable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [record?.id, record?.videoUri, record?.videoThumbnailUri, updateRecord]);

  if (!record) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>Record not found.</Text>
      </View>
    );
  }

  const handleStartEdit = () => {
    setEditedNote(record.note ?? "");
    setEditedYear(record.contextYear);
    setEditedTags((record.tags ?? []).filter((t) => t !== "voice-memo"));
    setEditedEmotion(record.emotion ?? "neutral");
    setEditedAudioUri(record.audioUri);
    setIsEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 100);
  };

  const handleCancelEdit = () => {
    if (editedAudioUri && editedAudioUri !== record.audioUri) {
      deleteAppAudio(editedAudioUri).catch(() => {});
    }
    setIsEditing(false);
    setEditedNote("");
    setEditedYear(undefined);
    setEditedTags([]);
    setEditedEmotion("neutral");
    setEditedAudioUri(undefined);
  };

  const handleEditedAudioSaved = (uri: string) => {
    if (
      editedAudioUri &&
      editedAudioUri !== record.audioUri &&
      editedAudioUri !== uri
    ) {
      deleteAppAudio(editedAudioUri).catch(() => {});
    }
    setEditedAudioUri(uri);
  };

  const handleEditedAudioDeleted = (uri: string) => {
    if (uri !== record.audioUri) {
      deleteAppAudio(uri).catch(() => {});
    }
    setEditedAudioUri(undefined);
  };

  // Promote a tag to position 0 (primary); others keep their relative order.
  const handlePromoteTag = (tag: string) => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setEditedTags((prev) => [tag, ...prev.filter((t) => t !== tag)]);
  };

  const handleSaveEdit = async () => {
    const trimmed = editedNote.trim();
    if (!trimmed) {
      Alert.alert("Empty Note", "Note cannot be empty.");
      return;
    }
    const yearChanged = editedYear !== record.contextYear;
    const tagsChanged = JSON.stringify(editedTags) !== JSON.stringify(record.tags ?? []);
    const emotionChanged = editedEmotion !== (record.emotion ?? "neutral");
    const audioChanged = editedAudioUri !== record.audioUri;
    if (trimmed === record.note && !yearChanged && !tagsChanged && !emotionChanged && !audioChanged) {
      setIsEditing(false);
      return;
    }
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const baseTags = editedTags.filter((t) => t !== "voice-memo");
    const tagsWithAudio = editedAudioUri ? ["voice-memo", ...baseTags] : baseTags;
    const newTags = tagsWithAudio.length > 0 ? tagsWithAudio : undefined;
    const newEditCount = (record.editCount ?? 0) + 1;

    await updateRecord(record.id, { note: trimmed, contextYear: editedYear, tags: newTags, emotion: editedEmotion, editCount: newEditCount, audioUri: editedAudioUri });
    setIsEditing(false);
    setEditedNote("");
    setEditedTags([]);

    Alert.alert("Saved", "Note updated.");
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
      JSON.stringify({ note: record.note ?? "", tags: record.tags ?? [], contextYear: record.contextYear })
    );
    router.push({ pathname: "/new-record", params: { fromContext: "1" } });
  };

  const handleGenerateEvents = async () => {
    if (!isPremiumUnlocked) {
      requestUnlock("Historical Events");
      return;
    }
    if (!record.contextYear) return;
    if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const events = await generateEvents(
      record.contextYear,
      settings.voiceLanguage,
      settings.maxInternationalEvents ?? 2,
      settings.maxNationalEvents ?? 2,
    );
    if (events.length === 0) {
      Alert.alert(
        "Generation Failed",
        "Could not generate historical events. Make sure your AI key is configured in Settings → AI Interviewer.",
      );
      return;
    }
    for (const ev of events) {
      await addRecord(ev);
    }
    const intlCount = events.filter((e) => e.eventScope === "international").length;
    const natCount = events.filter((e) => e.eventScope === "national").length;
    const parts: string[] = [];
    if (intlCount > 0) parts.push(`${intlCount} international`);
    if (natCount > 0) parts.push(`${natCount} national`);
    Alert.alert(
      `${record.contextYear} Events Added`,
      `Generated ${parts.join(" + ")} event${events.length !== 1 ? "s" : ""}. Find them highlighted in amber in your list.`,
    );
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
    shareBtn: { padding: 4 },
    shareCapture: {
      position: "absolute",
      top: 0,
      left: -1000,
      zIndex: -1,
      elevation: -1,
    },
    scroll: { flex: 1 },
    photo: { width: "100%", height: 280 },
    replacePhotoBtn: {
      position: "absolute",
      bottom: 10,
      right: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    replacePhotoBtnText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: "#fff",
    },
    addPhotoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    addPhotoRowText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    videoSection: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    videoThumbnail: { width: "100%", height: 220 },
    videoPlayOverlay: {
      position: "absolute",
      top: 0, left: 0, right: 0, bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    videoPlaceholder: {
      width: "100%",
      height: 120,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    videoPlaceholderText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    videoActionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      justifyContent: "flex-end",
    },
    videoActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    videoActionBtnText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
      color: "#fff",
    },
    addVideoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    addVideoRowText: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
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
    lockedVoiceMemo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    lockedVoiceMemoText: {
      flex: 1,
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
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
    tagReorderBox: {
      backgroundColor: colors.surface,
      borderRadius: colors.radius,
      padding: 12,
      gap: 10,
    },
    tagReorderHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    tagReorderLabel: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    tagReorderHint: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      flex: 1,
      textAlign: "right",
      fontStyle: "italic",
    },
    tagReorderRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    tagReorderChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    tagReorderChipPrimary: {
      backgroundColor: colors.primary + "14",
      borderColor: colors.primary,
    },
    tagRankBadge: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    tagRankBadgePrimary: {
      backgroundColor: colors.primary,
    },
    tagRankBadgeText: {
      fontSize: 10,
      fontFamily: "Inter_700Bold",
      color: colors.mutedForeground,
    },
    tagRankBadgeTextPrimary: {
      color: colors.primaryForeground,
    },
    tagReorderChipText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    tagReorderChipTextPrimary: {
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
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
    generateEventsBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.historical,
      borderRadius: colors.radius,
      paddingVertical: 14,
      borderWidth: 1.5,
      borderColor: colors.historicalBorder,
    },
    generateEventsBtnText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.historicalForeground,
    },
    historicalEventBadge: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.historicalBorder + "22",
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: colors.historicalBorder,
    },
    historicalEventBadgeText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.historicalForeground,
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

  const handleReplacePhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission Required", "Allow access to your photo library to pick images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const asset = result.assets[0];
    const extension = (asset.fileName?.split(".").pop() ?? asset.uri.split(".").pop() ?? "jpg")
      .split("?")[0];
    const durableImageUri = await copyImageToAppStorage(asset.uri, extension);
    await updateRecord(record.id, { imageUri: durableImageUri });
  };

  const handlePickVideo = async () => {
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

    const asset = result.assets[0];

    try {
      const ext = (asset.uri.split(".").pop() ?? "mp4").split("?")[0];
      // Copy into documentDirectory/videos/ — that folder is included in
      // iCloud backups by default, keeping videos safe through backup/restore.
      const destUri = await copyVideoToAppStorage(asset.uri, ext);

      let thumbnailUri: string | undefined;
      try {
        const { getThumbnailAsync } = await import("expo-video-thumbnails");
        const thumb = await getThumbnailAsync(destUri, { time: 0, quality: 0.7 });
        try {
          thumbnailUri = await copyThumbnailToAppStorage(thumb.uri);
        } catch {
          thumbnailUri = thumb.uri;
        }
      } catch { /* thumbnail optional */ }

      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Delete the previous video copy before saving the replacement.
      await deleteAppVideo(record.videoUri);
      await updateRecord(record.id, { videoUri: destUri, videoThumbnailUri: thumbnailUri });
    } catch {
      Alert.alert("Error", "Could not load video. Please try again.");
    }
  };

  const handleRemoveVideo = () => {
    Alert.alert("Remove video", "Remove the video from this record?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await deleteAppVideo(record.videoUri);
          await updateRecord(record.id, { videoUri: undefined, videoThumbnailUri: undefined });
        },
      },
    ]);
  };

  const handleShare = async () => {
    if (Platform.OS === "web" || isSharing) return;

    setIsSharing(true);
    let imageUri: string | undefined;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", "This device does not support sharing files.");
        return;
      }

      if (record.imageUri) {
        await Image.prefetch(record.imageUri).catch(() => false);
      }
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const cardView = shareCardRef.current;
      if (!cardView) throw new Error("Share card is not ready.");

      imageUri = await cardView.capture();
      await Sharing.shareAsync(imageUri, {
        mimeType: "image/png",
        dialogTitle: "Share memory card",
      });
    } catch (error) {
      console.warn("Share card creation failed", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const requiresNativeBuild = errorMessage.includes("RNViewShot is undefined");
      Alert.alert(
        requiresNativeBuild ? "Build required" : "Could not share memory",
        requiresNativeBuild
          ? "Image-card sharing needs the updated native app. Rebuild and reinstall the APK to use it."
          : "Please try again."
      );
    } finally {
      if (imageUri) {
        await FileSystem.deleteAsync(imageUri, { idempotent: true }).catch((error) => {
          console.warn("Temporary share card cleanup failed", error);
        });
      }
      setIsSharing(false);
    }
  };

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
            {Platform.OS !== "web" && (
              <Pressable
                style={[s.shareBtn, isSharing && { opacity: 0.45 }]}
                onPress={handleShare}
                disabled={isSharing}
                accessibilityRole="button"
                accessibilityLabel="Share this memory as an image"
                testID="share-record"
                hitSlop={8}
              >
                <Feather name="share-2" size={20} color={colors.primary} />
              </Pressable>
            )}
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
        {/* Photo */}
        {record.imageUri ? (
          <View>
            <Pressable onPress={() => setPhotoModalUri(record.imageUri!)}>
              <Image source={{ uri: record.imageUri }} style={s.photo} contentFit="cover" />
            </Pressable>
            {!isEditing && (
              <Pressable style={s.replacePhotoBtn} onPress={handleReplacePhoto}>
                <Feather name="camera" size={13} color="#fff" />
                <Text style={s.replacePhotoBtnText}>Replace photo</Text>
              </Pressable>
            )}
          </View>
        ) : !isEditing ? (
          <Pressable style={s.addPhotoRow} onPress={handleReplacePhoto}>
            <Feather name="camera" size={14} color={colors.primary} />
            <Text style={s.addPhotoRowText}>Add photo</Text>
          </Pressable>
        ) : null}

        {/* Video */}
        {record.videoUri ? (
          <View style={s.videoSection}>
            {record.videoThumbnailUri ? (
              <Pressable onPress={() => setVideoModalUri(record.videoUri!)}>
                <Image source={{ uri: record.videoThumbnailUri }} style={s.videoThumbnail} contentFit="cover" />
                <View style={s.videoPlayOverlay}>
                  <Feather name="play-circle" size={52} color="rgba(255,255,255,0.9)" />
                </View>

              </Pressable>
            ) : (
              <Pressable
                style={s.videoPlaceholder}
                onPress={isEditing ? undefined : () => setVideoModalUri(record.videoUri!)}
              >
                <Feather name="video" size={36} color={colors.primary} />
                <Text style={[s.videoPlaceholderText, { color: colors.primary }]}>
                  {isEditing ? "No thumbnail" : "Tap to play video"}
                </Text>
              </Pressable>
            )}
            {!isEditing && (
              <View style={s.videoActionRow}>
                <Pressable style={s.videoActionBtn} onPress={handlePickVideo}>
                  <Feather name="refresh-cw" size={12} color="#fff" />
                  <Text style={s.videoActionBtnText}>Replace</Text>
                </Pressable>
                <Pressable style={[s.videoActionBtn, { backgroundColor: "rgba(200,50,50,0.65)" }]} onPress={handleRemoveVideo}>
                  <Feather name="trash-2" size={12} color="#fff" />
                  <Text style={s.videoActionBtnText}>Remove</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : !isEditing ? (
          <Pressable style={s.addVideoRow} onPress={handlePickVideo}>
            <Feather name="video" size={14} color={colors.primary} />
            <Text style={s.addVideoRowText}>Add video</Text>
          </Pressable>
        ) : null}

        <View style={s.content}>
          {record.isHistoricalEvent && (
            <View style={s.historicalEventBadge}>
              <Feather
                name={record.eventScope === "international" ? "globe" : "flag"}
                size={13}
                color={colors.historicalForeground}
              />
              <Text style={s.historicalEventBadgeText}>
                {record.eventScope === "international" ? "International Event" : "National Event"}
              </Text>
            </View>
          )}

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
            {Array.isArray(record.tags) && record.tags.length > 0 && (
              <View style={s.metaRow}>
                <Feather name="tag" size={14} color={colors.primary} />
                <Text style={s.metaLabel}>Tags</Text>
                <Text style={s.metaValue}>{record.tags.map((t) => `#${t}`).join("  ")}</Text>
              </View>
            )}
            {(() => {
              const em = getEmotion(record.emotion);
              return (
                <View style={s.metaRow}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: em.color }} />
                  <Text style={s.metaLabel}>Emotion</Text>
                  <Text style={[s.metaValue, { color: em.color }]}>{em.label}</Text>
                </View>
              );
            })()}
            {!!record.location && (
              <View style={s.metaRow}>
                <Feather name="map-pin" size={14} color={colors.primary} />
                <Text style={s.metaLabel}>Location</Text>
                <Text style={s.metaValue}>{record.location}</Text>
              </View>
            )}
            {record.lat != null && record.lng != null && (
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

                {/* Tag management — reorder + add/remove */}
                <View style={s.tagReorderBox}>
                  {editedTags.length > 0 && (
                    <>
                      <View style={s.tagReorderHeader}>
                        <Feather name="folder" size={13} color={colors.mutedForeground} />
                        <Text style={s.tagReorderLabel}>Folder tag</Text>
                        <Text style={s.tagReorderHint}>Tap to promote · × to remove</Text>
                      </View>
                      <View style={s.tagReorderRow}>
                        {editedTags.map((tag, index) => {
                          const isPrimary = index === 0;
                          return (
                            <View key={tag} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Pressable
                                style={[s.tagReorderChip, isPrimary && s.tagReorderChipPrimary]}
                                onPress={() => handlePromoteTag(tag)}
                                disabled={isPrimary}
                              >
                                <View style={[s.tagRankBadge, isPrimary && s.tagRankBadgePrimary]}>
                                  <Text style={[s.tagRankBadgeText, isPrimary && s.tagRankBadgeTextPrimary]}>
                                    {index + 1}
                                  </Text>
                                </View>
                                <Text style={[s.tagReorderChipText, isPrimary && s.tagReorderChipTextPrimary]}>
                                  #{tag}
                                </Text>
                                {isPrimary && (
                                  <Feather name="folder" size={12} color={colors.primary} />
                                )}
                              </Pressable>
                              <Pressable
                                hitSlop={8}
                                onPress={() => {
                                  if (Platform.OS !== "web") Haptics.selectionAsync();
                                  setEditedTags((prev) => prev.filter((t) => t !== tag));
                                }}
                                style={{ padding: 2 }}
                              >
                                <Feather name="x" size={14} color={colors.mutedForeground} />
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    </>
                  )}
                  {/* Add tags from known tags */}
                  {knownTags.filter((t) => !editedTags.includes(t)).length > 0 && (
                    <View style={{ gap: 6, marginTop: editedTags.length > 0 ? 10 : 0 }}>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: colors.mutedForeground }}>
                        Add tag:
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {knownTags.filter((t) => !editedTags.includes(t)).map((tag) => (
                          <Pressable
                            key={tag}
                            onPress={() => {
                              if (Platform.OS !== "web") Haptics.selectionAsync();
                              setEditedTags((prev) => [...prev, tag]);
                            }}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 4,
                              backgroundColor: colors.surface,
                              borderRadius: 12,
                              borderWidth: 1,
                              borderColor: colors.border,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                            }}
                          >
                            <Feather name="plus" size={12} color={colors.mutedForeground} />
                            <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: colors.foreground }}>
                              #{tag}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                {/* Emotion picker */}
                <View style={{ gap: 6 }}>
                  <Text style={s.tagReorderLabel}>Emotion</Text>
                  <EmotionPicker value={editedEmotion} onChange={setEditedEmotion} />
                </View>

                {/* Memory year stepper */}
                <View style={s.yearStepperRow}>
                  <Feather name="clock" size={13} color={colors.mutedForeground} style={{ marginTop: 1 }} />
                  <Text style={s.yearStepperLabel}>Memory year</Text>
                  <View style={s.yearStepperControls}>
                    <Pressable
                      style={s.yearStepperBtn}
                      onPress={() => {
                        if (Platform.OS !== "web") Haptics.selectionAsync();
                        setEditedYear((y) => y !== undefined ? Math.max(1900, y - 1) : currentYear - 1);
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
                          setYearInputText(editedYear ? String(editedYear) : "");
                          setYearInputActive(true);
                          setTimeout(() => yearInputRef.current?.focus(), 50);
                        }}
                        hitSlop={6}
                      >
                        <Text style={[s.yearStepperValue, editedYear === undefined && s.yearStepperValueEmpty]}>
                          {editedYear !== undefined ? String(editedYear) : "—"}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={s.yearStepperBtn}
                      onPress={() => {
                        if (Platform.OS !== "web") Haptics.selectionAsync();
                        setEditedYear((y) => y !== undefined ? Math.min(currentYear, y + 1) : currentYear);
                      }}
                    >
                      <Feather name="plus" size={14} color={colors.foreground} />
                    </Pressable>
                  </View>
                  {editedYear !== undefined && (
                    <Pressable
                      onPress={() => {
                        if (Platform.OS !== "web") Haptics.selectionAsync();
                        setEditedYear(undefined);
                      }}
                      hitSlop={8}
                    >
                      <Feather name="x" size={14} color={colors.mutedForeground} />
                    </Pressable>
                  )}
                </View>

                {/* Voice memo — available while editing */}
                <View style={{ marginTop: 4 }}>
                  {isPremiumUnlocked ? (
                    <VoiceMemoRecorder
                      audioUri={editedAudioUri}
                      onSaved={handleEditedAudioSaved}
                      onDeleted={handleEditedAudioDeleted}
                    />
                  ) : (
                    <Pressable
                      style={s.lockedVoiceMemo}
                      onPress={() => requestUnlock("Voice Memos")}
                      accessibilityRole="button"
                    >
                      <Feather name="lock" size={16} color={colors.primary} />
                      <Text style={s.lockedVoiceMemoText}>
                        {editedAudioUri
                          ? "Voice memo attached — unlock to play or edit it"
                          : "Unlock Premium Features to add a voice memo"}
                      </Text>
                      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                    </Pressable>
                  )}
                </View>

                <View style={s.editActions}>
                  <Pressable style={s.editCancelInline} onPress={handleCancelEdit}>
                    <Text style={s.editCancelInlineText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={s.editSaveInline} onPress={handleSaveEdit} disabled={saving}>
                    <Text style={s.editSaveInlineText}>
                      {saving ? "Saving…" : "Save"}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={s.noteText}>{record.note || "No note added."}</Text>
                {record.audioUri && (
                  <View style={{ marginTop: 12 }}>
                    {isPremiumUnlocked ? (
                      <VoiceMemoPlayer uri={record.audioUri} />
                    ) : (
                      <Pressable
                        style={s.lockedVoiceMemo}
                        onPress={() => requestUnlock("Voice Memos")}
                        accessibilityRole="button"
                      >
                        <Feather name="lock" size={16} color={colors.primary} />
                        <Text style={s.lockedVoiceMemoText}>
                          Voice memo attached — unlock Premium Features to play it
                        </Text>
                        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                      </Pressable>
                    )}
                  </View>
                )}
              </>
            )}
          </View>

          {!isEditing && record.contextYear !== undefined && !record.isHistoricalEvent && (
            <Pressable
              style={[s.generateEventsBtn, generatingEvents && { opacity: 0.65 }]}
              onPress={handleGenerateEvents}
              disabled={generatingEvents}
            >
              <Feather
                name={isPremiumUnlocked ? "globe" : "lock"}
                size={18}
                color={colors.historicalForeground}
              />
              <Text style={s.generateEventsBtnText}>
                {generatingEvents
                  ? "Generating events…"
                  : isPremiumUnlocked
                  ? `Generate ${record.contextYear} events`
                  : `Generate ${record.contextYear} events — unlock`}
              </Text>
            </Pressable>
          )}

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

      {Platform.OS !== "web" && (
        <View
          pointerEvents="none"
          accessible={false}
          style={[
            s.shareCapture,
            { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
          ]}
        >
          <ViewShot
            ref={shareCardRef}
            options={{ format: "png", quality: 1, result: "tmpfile" }}
            style={{ width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT }}
          >
            <ShareCard key={`${record.id}-${record.imageUri ?? "no-photo"}`} record={record} />
          </ViewShot>
        </View>
      )}

      <UnlockModal
        visible={showUnlockModal}
        featureName={unlockFeatureName}
        onClose={() => setShowUnlockModal(false)}
      />
      <PhotoViewerModal uri={photoModalUri} onClose={() => setPhotoModalUri(null)} />
      <VideoPlayerModal
        uri={videoModalUri}
        onClose={() => setVideoModalUri(null)}
      />
    </View>
  );
}
