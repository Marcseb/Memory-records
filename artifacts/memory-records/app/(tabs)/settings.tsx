import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { StorageAccessFramework } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Haptics from "expo-haptics";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import Constants from "expo-constants";
import { getSecureItem, setSecureItem } from "@/utils/secureStorage";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { MemoryRecord, useRecords } from "@/context/RecordsContext";
import { VoiceLanguage, VOICE_LANGUAGES, useSettings } from "@/context/SettingsContext";
import { useUnlock } from "@/context/UnlockContext";
import { UnlockModal } from "@/components/UnlockModal";
import { AppLockSettings } from "@/components/AppLock";
import { useColors } from "@/hooks/useColors";
import { zipSync } from "fflate";
import { buildAllExportData } from "@/hooks/useObsidian";
import { isObsidianMarkdown, parseMultipleObsidianNotes, parseObsidianNote } from "@/utils/obsidianParser";
import { getVideoStorageSize, formatBytes } from "@/utils/storage";
import {
  recoverPreviousExpoData,
  scanPreviousExpoData,
  type ExpoRecoveryCandidate,
} from "@/utils/expoDataRecovery";
import {
  createCompleteBackup,
  discardCompleteRestore,
  inspectCompleteBackup,
  restoreCompleteBackup,
  type CompleteBackupInspection,
  type CompleteBackupProgress,
} from "@/utils/completeBackup";
import {
  createLocalSnapshot,
  deleteLocalSnapshot,
  discardLocalSnapshotRestore,
  getSnapshotStatus,
  isLocalSnapshotOperationActive,
  listLocalSnapshots,
  resetSnapshotTestHistory,
  SNAPSHOT_CHANGE_LOGIC_VERSION,
  stageLocalSnapshotRestore,
  type SnapshotProgress,
  type SnapshotStatus,
  type SnapshotSummary,
} from "@/utils/localSnapshots";
import {
  getCompleteBackupReminderStatus,
  markCompleteBackupSuccessful,
  requireCompleteBackupAfterRestore,
  snoozeCompleteBackupReminder,
  type CompleteBackupReminderStatus,
} from "@/utils/completeBackupReminder";

async function withSnapshotWakeLock<T>(operation: () => Promise<T>): Promise<T> {
  const tag = "memory-records-manual-snapshot";
  let active = false;
  try {
    await activateKeepAwakeAsync(tag).then(() => { active = true; }).catch(() => {});
    return await operation();
  } finally {
    if (active) await deactivateKeepAwake(tag).catch(() => {});
  }
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { resetAllData } = useAuth();
  const { records, knownTags, addTag, deleteTag, importRecords } = useRecords();
  const { settings, updateSettings } = useSettings();
  const isSnapshotTestBuild = Constants.expoConfig?.extra?.snapshotTestBuild === true;
  // Expo Go is the only runtime whose files live beside older ExperienceData scopes.
  // StoreClient also includes dev builds, so appOwnership is needed to distinguish Expo Go.
  const canRecoverPreviousExpoGoData =
    Platform.OS === "android" && Constants.appOwnership === "expo";
  const advanceSnapshotTestDate = async (days: number) => {
    const current = settings.snapshotTestDate
      ? new Date(settings.snapshotTestDate)
      : new Date();
    current.setDate(current.getDate() + days);
    await updateSettings({ snapshotTestDate: current.toISOString() });
  };
  const handleResetSnapshotTestHistory = () => {
    if (!ensureSnapshotIdle()) return;
    Alert.alert(
      "Reset snapshot history?",
      "Every local snapshot and its vaulted snapshot media will be permanently deleted. Memories, tags, and settings will remain. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset history",
          style: "destructive",
          onPress: () => {
            (async () => {
              setSnapshotBusy(true);
              try {
                await resetSnapshotTestHistory();
                await refreshLocalSnapshots();
                DeviceEventEmitter.emit("localSnapshotChanged", { invalidateAutomaticCheck: true });
                Alert.alert(
                  "Snapshot history reset",
                  "The existing memories and settings were kept. Leave the Memories screen open for two quiet minutes, or use Create snapshot now.",
                );
              } catch (error) {
                Alert.alert("Snapshot history reset failed", String(error));
              } finally {
                setSnapshotBusy(false);
              }
            })();
          },
        },
      ],
    );
  };
  const [vaultName, setVaultName] = useState(settings.vaultName);
  const [folder, setFolder] = useState(settings.folder);
  const [authorName, setAuthorName] = useState(settings.authorName);
  const [saving, setSaving] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  const [exportingToObsidian, setExportingToObsidian] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);

  const [videoStorage, setVideoStorage] = useState<{ bytes: number; fileCount: number } | null>(null);
  const [recoveringPreviousData, setRecoveringPreviousData] = useState(false);
  const [completeBackupBusy, setCompleteBackupBusy] = useState(false);
  const [completeBackupProgress, setCompleteBackupProgress] = useState<CompleteBackupProgress | null>(null);
  const [completeBackupOperation, setCompleteBackupOperation] =
    useState<"backup" | "restore" | null>(null);
  const [completeBackupReminder, setCompleteBackupReminder] =
    useState<CompleteBackupReminderStatus | null>(null);
  const [localSnapshots, setLocalSnapshots] = useState<SnapshotSummary[]>([]);
  const [snapshotStatus, setSnapshotStatus] = useState<SnapshotStatus | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [automaticSnapshotRunning, setAutomaticSnapshotRunning] = useState(isLocalSnapshotOperationActive);
  const [snapshotOperationProgress, setSnapshotOperationProgress] = useState<SnapshotProgress | null>(null);
  const [snapshotRestoreProgress, setSnapshotRestoreProgress] = useState<SnapshotProgress | null>(null);
  const settingsFocusedRef = React.useRef(false);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener("localSnapshotOperationStatus", setAutomaticSnapshotRunning);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    DeviceEventEmitter.emit(
      "localSnapshotAutomaticBlocked",
      snapshotBusy || completeBackupBusy || recoveringPreviousData || importing || exportingToObsidian || importModalVisible,
    );
    return () => { DeviceEventEmitter.emit("localSnapshotAutomaticBlocked", false); };
  }, [snapshotBusy, completeBackupBusy, recoveringPreviousData, importing, exportingToObsidian, importModalVisible]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getVideoStorageSize().then((result) => {
        if (!cancelled) setVideoStorage(result);
      }).catch(() => {});
      return () => { cancelled = true; };
    }, [])
  );

  const refreshLocalSnapshots = useCallback(async () => {
    try {
      const status = await getSnapshotStatus();
      setSnapshotStatus(status);
    } catch (error) {
      console.warn("[LocalSnapshots] status failed:", error);
    }
    // Let the success timestamp render before reading history metadata.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    try {
      setLocalSnapshots(await listLocalSnapshots());
    } catch (error) {
      console.warn("[LocalSnapshots] history failed:", error);
    }
  }, []);

  const refreshCompleteBackupReminder = useCallback(async () => {
    try {
      setCompleteBackupReminder(await getCompleteBackupReminderStatus(records.length));
    } catch (error) {
      console.warn("[CompleteBackupReminder] status failed:", error);
    }
  }, [records.length]);

  const refreshSnapshotStatus = useCallback(async () => {
    try {
      setSnapshotStatus(await getSnapshotStatus());
    } catch (error) {
      console.warn("[LocalSnapshots] status failed:", error);
    }
  }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      "localSnapshotChanged",
      () => {
        if (settingsFocusedRef.current) {
          refreshLocalSnapshots().catch(() => {});
        } else {
          // Settings tabs remain mounted while hidden. Keep this global listener
          // lightweight; full vault verification runs only when Settings is open.
          refreshSnapshotStatus().catch(() => {});
        }
      },
    );
    return () => subscription.remove();
  }, [refreshLocalSnapshots, refreshSnapshotStatus]);

  useFocusEffect(
    useCallback(() => {
      settingsFocusedRef.current = true;
      refreshLocalSnapshots().catch(() => {});
      refreshCompleteBackupReminder().catch(() => {});
      return () => {
        settingsFocusedRef.current = false;
      };
    }, [refreshCompleteBackupReminder, refreshLocalSnapshots]),
  );

  const { isPremiumUnlocked, checkStatus, isChecking } = useUnlock();
  const [tagsCollapsed, setTagsCollapsed] = useState(true);
  const [newTagDraft, setNewTagDraft] = useState("");
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  const [mistralKey, setMistralKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [showMistralKey, setShowMistralKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [aiKeysSaving, setAiKeysSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [m, o] = await Promise.all([
          getSecureItem("mr_mistral_key"),
          getSecureItem("mr_openai_key"),
        ]);
        if (m) setMistralKey(m);
        if (o) setOpenaiKey(o);
      } catch { /* ignore */ }
    })();
  }, []);

  const ensureSnapshotIdle = () => {
    if (!snapshotBusy && !isLocalSnapshotOperationActive()) return true;
    Alert.alert(
      "Snapshot work is running",
      "Please wait for snapshot verification to finish before starting another backup, restore, import, or cleanup. You can still create and edit memories.",
    );
    return false;
  };

  const handleExport = async () => {
    if (!ensureSnapshotIdle()) return;
    try {
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const filename = `memory-records-backup-${stamp}.json`;
      const payload = JSON.stringify({ records, tags: knownTags }, null, 2);

      if (Platform.OS === "android") {
        // Android: use SAF folder picker so the user can save to any location
        // (Documents, SD card, Drive, etc.) — Sharing.shareAsync only offers apps.
        const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perm.granted) return;
        const fileUri = await StorageAccessFramework.createFileAsync(
          perm.directoryUri,
          filename,
          "application/json"
        );
        await StorageAccessFramework.writeAsStringAsync(fileUri, payload);
        Alert.alert("Export saved", `${filename} was saved to the folder you selected.`);
      } else {
        // iOS / web: share sheet → user taps "Save to Files"
        const fileUri = (FileSystem.cacheDirectory ?? "") + filename;
        await FileSystem.writeAsStringAsync(fileUri, payload);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/json",
            dialogTitle: "Save Memory Records Backup",
            UTI: "public.json",
          });
        } else {
          await Share.share({ message: payload, title: "Memory Records Backup" });
        }
      }
    } catch (e) {
      Alert.alert("Export Error", String(e));
    }
  };

  const handleCreateCompleteBackup = async () => {
    if (!ensureSnapshotIdle()) return;
    if (Platform.OS !== "android") {
      Alert.alert(
        "Android folder backup",
        "Complete folder backups are currently available on Android. The existing JSON backup remains available on other platforms.",
      );
      return;
    }

    setCompleteBackupBusy(true);
    setCompleteBackupOperation("backup");
    try {
      const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permission.granted) return;

      const result = await createCompleteBackup(
        permission.directoryUri,
        records,
        knownTags,
        settings,
        setCompleteBackupProgress,
      );
      await markCompleteBackupSuccessful();
      await refreshCompleteBackupReminder();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Complete Backup Saved",
        `${result.filename} was created with ${records.length} record${records.length !== 1 ? "s" : ""} and ${result.mediaCount} media file${result.mediaCount !== 1 ? "s" : ""}.` +
          (result.skippedThumbnailCount > 0
            ? `\n\n${result.skippedThumbnailCount} inaccessible video thumbnail${result.skippedThumbnailCount !== 1 ? "s were" : " was"} skipped. The video itself is included and will show a play-icon placeholder after restore.`
            : ""),
      );
    } catch (error) {
      Alert.alert(
        "Complete Backup Failed",
        `${String(error)}\n\nNo valid complete-backup manifest was left behind. Your original records and media were not changed.`,
      );
    } finally {
      setCompleteBackupBusy(false);
      setCompleteBackupProgress(null);
      setCompleteBackupOperation(null);
    }
  };

  const performCompleteRestore = async (inspection: CompleteBackupInspection) => {
    if (!ensureSnapshotIdle()) return;
    setCompleteBackupBusy(true);
    setCompleteBackupOperation("restore");
    let stagedRestore: Awaited<ReturnType<typeof restoreCompleteBackup>> | null = null;
    let recordsCommitted = false;
    try {
      stagedRestore = await restoreCompleteBackup(inspection, setCompleteBackupProgress);
      await importRecords(stagedRestore.records, stagedRestore.tags);
      recordsCommitted = true;
      await requireCompleteBackupAfterRestore();
      await refreshCompleteBackupReminder();

      let settingsWarning = "";
      try {
        await updateSettings(stagedRestore.settings);
        setVaultName(stagedRestore.settings.vaultName);
        setFolder(stagedRestore.settings.folder);
        setAuthorName(stagedRestore.settings.authorName);
      } catch (settingsError) {
        settingsWarning = `\n\nRecords and media were restored, but settings could not be restored: ${String(settingsError)}`;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        "Complete Restore Finished",
        `${stagedRestore.records.length} record${stagedRestore.records.length !== 1 ? "s were" : " was"} restored with ${stagedRestore.mediaCount} media file${stagedRestore.mediaCount !== 1 ? "s" : ""}. Existing unrelated records were kept.${settingsWarning}`,
      );
    } catch (error) {
      if (stagedRestore && !recordsCommitted) await discardCompleteRestore(stagedRestore);
      if (recordsCommitted) {
        Alert.alert(
          "Restore Completed with a Warning",
          `Records and media were restored, but a later non-data step failed: ${String(error)}`,
        );
      } else {
        Alert.alert(
          "Complete Restore Failed",
          `${String(error)}\n\nThe backup was not imported and existing records were not changed.`,
        );
      }
    } finally {
      setCompleteBackupBusy(false);
      setCompleteBackupProgress(null);
      setCompleteBackupOperation(null);
    }
  };

  const handleRestoreCompleteBackup = async () => {
    if (!ensureSnapshotIdle()) return;
    if (Platform.OS !== "android") {
      Alert.alert(
        "Android folder restore",
        "Complete folder restore is currently available on Android.",
      );
      return;
    }

    setCompleteBackupBusy(true);
    setCompleteBackupOperation("restore");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/octet-stream", "*/*"],
        multiple: false,
        copyToCacheDirectory: false,
      });
      if (picked.canceled || picked.assets.length === 0) return;
      const inspection = await inspectCompleteBackup(picked.assets[0].uri);
      setCompleteBackupBusy(false);

      const { manifest } = inspection;
      Alert.alert(
        "Restore Complete Backup?",
        `Backup created ${new Date(manifest.createdAt).toLocaleString()}.\n\n${manifest.records.length} record${manifest.records.length !== 1 ? "s" : ""} and ${manifest.media.length} media file${manifest.media.length !== 1 ? "s" : ""} will be restored. Records with matching IDs return to the backup version; unrelated current records are kept.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            onPress: () => {
              performCompleteRestore(inspection).catch(() => {});
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert("Invalid Complete Backup", String(error));
    } finally {
      setCompleteBackupBusy(false);
      setCompleteBackupProgress(null);
      setCompleteBackupOperation(null);
    }
  };

  const performPreviousDataRecovery = async (candidates: ExpoRecoveryCandidate[]) => {
    if (!ensureSnapshotIdle()) return;
    setRecoveringPreviousData(true);
    try {
      const recoveredById = new Map<string, MemoryRecord>();
      const recoveredTags = new Set<string>();
      let mediaCopied = 0;
      let mediaMissing = 0;

      for (const candidate of candidates) {
        const result = await recoverPreviousExpoData(candidate);
        for (const record of result.records) {
          if (!recoveredById.has(record.id)) recoveredById.set(record.id, record);
        }
        for (const tag of result.tags) recoveredTags.add(tag);
        mediaCopied += result.mediaCopied;
        mediaMissing += result.mediaMissing;
      }

      const currentById = new Map(records.map((record) => [record.id, record]));
      const isCopiedRecoveryUri = (uri: string | undefined, category: string) =>
        Boolean(uri?.includes(`/recovered/${category}/`));
      const recoveredRecords = Array.from(recoveredById.values()).map((recovered) => {
        const current = currentById.get(recovered.id);
        if (!current) return recovered;

        // JSON restore can recreate record metadata while leaving media URIs
        // pointed at an inaccessible Expo Go scope. Preserve current metadata
        // and replace only media that recovery successfully copied.
        return {
          ...current,
          imageUri: isCopiedRecoveryUri(recovered.imageUri, "images")
            ? recovered.imageUri
            : current.imageUri,
          videoUri: isCopiedRecoveryUri(recovered.videoUri, "videos")
            ? recovered.videoUri
            : current.videoUri,
          videoThumbnailUri: isCopiedRecoveryUri(recovered.videoThumbnailUri, "thumbnails")
            ? recovered.videoThumbnailUri
            : current.videoThumbnailUri,
          audioUri: isCopiedRecoveryUri(recovered.audioUri, "audio")
            ? recovered.audioUri
            : current.audioUri,
        };
      });
      await importRecords(recoveredRecords, Array.from(recoveredTags));
      await requireCompleteBackupAfterRestore();
      await refreshCompleteBackupReminder();
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const mediaSummary =
        mediaCopied > 0
          ? ` ${mediaCopied} attached media file${mediaCopied !== 1 ? "s were" : " was"} copied.`
          : "";
      const missingSummary =
        mediaMissing > 0
          ? ` ${mediaMissing} referenced media file${mediaMissing !== 1 ? "s were" : " was"} no longer available.`
          : "";
      Alert.alert(
        "Recovery Complete",
        `${recoveredRecords.length} memor${recoveredRecords.length === 1 ? "y was" : "ies were"} restored or repaired.${mediaSummary}${missingSummary}\n\nPlease create a complete backup now.`,
      );
    } catch (error) {
      Alert.alert("Recovery Failed", String(error));
    } finally {
      setRecoveringPreviousData(false);
    }
  };

  const handlePreviousDataRecovery = async () => {
    if (Platform.OS === "web") {
      Alert.alert("Android only", "Open this tool inside Expo Go on the phone that held your memories.");
      return;
    }

    setRecoveringPreviousData(true);
    try {
      const candidates = await scanPreviousExpoData();
      setRecoveringPreviousData(false);

      if (candidates.length === 0) {
        Alert.alert(
          "No Previous Data Found",
          "No older Memory Records files were visible to this Expo Go session. Do not uninstall Expo Go; an existing JSON backup or Obsidian export may still restore your notes.",
        );
        return;
      }

      const uniqueIds = new Set(candidates.flatMap((candidate) => candidate.records.map((record) => record.id)));
      Alert.alert(
        "Previous Data Found",
        `${uniqueIds.size} memor${uniqueIds.size === 1 ? "y" : "ies"} found in ${candidates.length} previous app storage ${candidates.length === 1 ? "folder" : "folders"}.\n\nRecovery will copy them into this version and keep any current records. The old data will not be deleted.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Recover",
            onPress: () => {
              performPreviousDataRecovery(candidates).catch(() => {});
            },
          },
        ],
      );
    } catch (error) {
      setRecoveringPreviousData(false);
      Alert.alert("Scan Failed", String(error));
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
    if (!ensureSnapshotIdle()) return;
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
    if (!ensureSnapshotIdle()) return;
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
    if (!ensureSnapshotIdle()) return;
    try {
      // Use DocumentPicker on all platforms — consistent, reliable, and works
      // correctly on Samsung Galaxy where the SAF folder picker was resetting
      // its remembered location on each new deployment.
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

  const handleExportAllToObsidian = async () => {
    if (!ensureSnapshotIdle()) return;
    if (exportingToObsidian) return;
    if (records.length === 0) {
      Alert.alert("Nothing to export", "No records found.");
      return;
    }
    const isAndroid = Platform.OS === "android";
    Alert.alert(
      `Export ${records.length} note${records.length !== 1 ? "s" : ""} to Obsidian`,
      isAndroid
        ? "Pick your Obsidian vault folder. All notes will be written there directly — no app switching needed."
        : "A ZIP of all notes will be created. Save it to Files, then extract it into your Obsidian vault.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Export all",
          onPress: async () => {
            setExportingToObsidian(true);
            setExportProgress({ current: 0, total: records.length });
            if (Platform.OS !== "web") await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              const files = buildAllExportData(records, settings.authorName || undefined);
              const folder = settings.folder || "Memory Records";

              if (isAndroid) {
                // ── Android: write .md files directly into the vault folder via SAF ──
                const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (!perm.granted) {
                  setExportingToObsidian(false);
                  setExportProgress(null);
                  return;
                }
                let written = 0;
                let failed = 0;
                for (let i = 0; i < files.length; i++) {
                  setExportProgress({ current: i + 1, total: files.length });
                  try {
                    const uri = await StorageAccessFramework.createFileAsync(
                      perm.directoryUri, files[i].filename, "text/markdown"
                    );
                    await StorageAccessFramework.writeAsStringAsync(uri, files[i].content);
                    written++;
                  } catch {
                    failed++;
                  }
                }
                setExportingToObsidian(false);
                setExportProgress(null);
                if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert(
                  failed === 0 ? "Export complete ✓" : "Export finished",
                  failed === 0
                    ? `${written} note${written !== 1 ? "s" : ""} written to the selected folder.`
                    : `${written} written, ${failed} failed.`
                );
              } else {
                // ── iOS / web: build a ZIP and share it ──
                setExportProgress({ current: files.length, total: files.length });
                const zipEntries: Record<string, Uint8Array> = {};
                const encoder = new TextEncoder();
                for (const { filename, content } of files) {
                  zipEntries[`${folder}/${filename}`] = encoder.encode(content);
                }
                const zipped = zipSync(zipEntries, { level: 1 }); // level 1 = fast

                // Uint8Array → base64
                let binary = "";
                const chunkSize = 0x8000;
                for (let i = 0; i < zipped.length; i += chunkSize) {
                  binary += String.fromCharCode(...zipped.subarray(i, Math.min(i + chunkSize, zipped.length)));
                }
                const base64 = btoa(binary);

                const stamp = new Date().toISOString().slice(0, 10);
                const zipUri = (FileSystem.cacheDirectory ?? "") + `obsidian-export-${stamp}.zip`;
                await FileSystem.writeAsStringAsync(zipUri, base64, {
                  encoding: FileSystem.EncodingType.Base64,
                });

                setExportingToObsidian(false);
                setExportProgress(null);

                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                  await Sharing.shareAsync(zipUri, {
                    mimeType: "application/zip",
                    dialogTitle: "Save Obsidian export",
                    UTI: "public.zip-archive",
                  });
                  // After the share sheet closes, guide the user through extraction.
                  if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert(
                    "How to add notes to Obsidian",
                    `1. Open the Files app and find the ZIP you just saved.\n\n` +
                    `2. Tap the ZIP — iOS extracts it automatically into a "${folder}" folder.\n\n` +
                    `3. Long-press that folder → Move.\n\n` +
                    `4. Navigate to: On My iPhone → Obsidian → ${settings.vaultName}\n\n` +
                    `5. Tap Move here.\n\n` +
                    `Your ${files.length} note${files.length !== 1 ? "s" : ""} will appear in Obsidian immediately.`,
                    [{ text: "Got it ✓" }]
                  );
                } else {
                  Alert.alert("Export ready", `ZIP saved to:\n${zipUri}`);
                }
              }
            } catch (e) {
              setExportingToObsidian(false);
              setExportProgress(null);
              Alert.alert("Export Error", String(e));
            }
          },
        },
      ]
    );
  };

  const handleLanguageSelect = async (lang: VoiceLanguage) => {
    if (Platform.OS !== "web") await Haptics.selectionAsync();
    await updateSettings({ voiceLanguage: lang });
  };

  const handleEventCount = async (type: "international" | "national", delta: number) => {
    if (Platform.OS !== "web") await Haptics.selectionAsync();
    if (type === "international") {
      const next = Math.max(0, Math.min(5, (settings.maxInternationalEvents ?? 2) + delta));
      await updateSettings({ maxInternationalEvents: next });
    } else {
      const next = Math.max(0, Math.min(5, (settings.maxNationalEvents ?? 2) + delta));
      await updateSettings({ maxNationalEvents: next });
    }
  };

  const handleSaveAiKeys = async () => {
    setAiKeysSaving(true);
    try {
      await Promise.all([
        setSecureItem("mr_mistral_key", mistralKey.trim()),
        setSecureItem("mr_openai_key", openaiKey.trim()),
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

  const handleRestoreLocalSnapshot = (snapshot: SnapshotSummary) => {
    if (!ensureSnapshotIdle()) return;
    Alert.alert(
      "Restore local snapshot?",
      `${new Date(snapshot.createdAt).toLocaleString()}\n\n${snapshot.recordCount} records and ${snapshot.mediaCount} media files will be staged and verified. Matching IDs will be replaced; unrelated current records stay.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: () => {
            (async () => {
              setSnapshotBusy(true);
              setSnapshotRestoreProgress({ stage: "Preparing snapshot restore", current: 0, total: 0 });
              let staged: Awaited<ReturnType<typeof stageLocalSnapshotRestore>> | null = null;
              let committed = false;
              try {
                staged = await stageLocalSnapshotRestore(snapshot.id, setSnapshotRestoreProgress);
                setSnapshotRestoreProgress({
                  stage: "Restoring memories and tags",
                  current: 0,
                  total: staged.records.length,
                });
                await importRecords(staged.records, staged.tags);
                committed = true;
                await requireCompleteBackupAfterRestore();
                await refreshCompleteBackupReminder();
                setSnapshotRestoreProgress({
                  stage: "Restoring settings",
                  current: staged.records.length,
                  total: staged.records.length,
                });
                const restoredSettings = isSnapshotTestBuild
                  ? { ...staged.settings, snapshotTestDate: settings.snapshotTestDate }
                  : staged.settings;
                await updateSettings(restoredSettings);
                setVaultName(restoredSettings.vaultName);
                setFolder(restoredSettings.folder);
                setAuthorName(restoredSettings.authorName);
                await refreshLocalSnapshots();
                Alert.alert(
                  "Snapshot restored",
                  "Matching memories were replaced and unrelated memories were kept.\n\nCreate a fresh complete backup now to protect the restored library outside this device.",
                  [
                    {
                      text: "Remind Me Later",
                      onPress: () => {
                        snoozeCompleteBackupReminder()
                          .then(refreshCompleteBackupReminder)
                          .catch(() => {});
                      },
                    },
                    {
                      text: "Create Backup",
                      onPress: () => {
                        handleCreateCompleteBackup().catch(() => {});
                      },
                    },
                  ],
                );
              } catch (error) {
                if (staged && !committed) await discardLocalSnapshotRestore(staged);
                Alert.alert(
                  committed ? "Restore completed with a warning" : "Snapshot restore failed",
                  String(error),
                );
              } finally {
                setSnapshotRestoreProgress(null);
                setSnapshotBusy(false);
              }
            })().catch(() => {});
          },
        },
      ],
    );
  };

  const handleCreateLocalSnapshot = async () => {
    if (!ensureSnapshotIdle()) return;
    setSnapshotBusy(true);
    setSnapshotOperationProgress({ stage: "Preparing local snapshot", current: 0, total: records.length });
    try {
      await withSnapshotWakeLock(() =>
        createLocalSnapshot(records, knownTags, settings, setSnapshotOperationProgress));
      await refreshLocalSnapshots();
      DeviceEventEmitter.emit("localSnapshotChanged", { invalidateAutomaticCheck: true });
      Alert.alert("Snapshot created", "A verified device-only snapshot is ready. This does not replace a portable Complete backup.");
    } catch (error) {
      Alert.alert("Could not create snapshot", String(error));
    } finally {
      setSnapshotOperationProgress(null);
      setSnapshotBusy(false);
    }
  };

  const handleDeleteLocalSnapshot = (snapshot: SnapshotSummary) => {
    if (!ensureSnapshotIdle()) return;
    Alert.alert(
      "Delete local snapshot?",
      `${new Date(snapshot.createdAt).toLocaleString()}\n\nThis restore point will be removed. Other retained snapshots are not affected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            (async () => {
              setSnapshotBusy(true);
              setSnapshotOperationProgress({ stage: "Checking snapshot history", current: 0, total: 0 });
              try {
                await withSnapshotWakeLock(() => deleteLocalSnapshot(snapshot.id, setSnapshotOperationProgress));
                await refreshLocalSnapshots();
                DeviceEventEmitter.emit("localSnapshotChanged", { invalidateAutomaticCheck: true });
              } catch (error) {
                Alert.alert("Could not delete snapshot", String(error));
              } finally {
                setSnapshotOperationProgress(null);
                setSnapshotBusy(false);
              }
            })().catch(() => {});
          },
        },
      ],
    );
  };

  const handleAddTag = async () => {
    const normalized = newTagDraft.trim();
    if (!normalized) return;
    await addTag(normalized);
    setNewTagDraft("");
    Keyboard.dismiss();
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
    if (!ensureSnapshotIdle()) return;
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
    snapshotRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 8,
    },
    snapshotAction: {
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 17,
      backgroundColor: colors.surface,
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
    collapsibleHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    tagCloud: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    addTagRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    addTagInput: {
      flex: 1,
      minHeight: 38,
      paddingHorizontal: 12,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      color: colors.foreground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
    },
    addTagButton: {
      minHeight: 38,
      paddingHorizontal: 12,
      borderRadius: colors.radius,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    addTagButtonText: {
      color: colors.primaryForeground,
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
    },
    tagPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tagPillText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    snapshotTestActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 6,
    },
    snapshotTestButton: {
      minHeight: 36,
      paddingHorizontal: 11,
      borderRadius: colors.radius,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    snapshotTestButtonText: {
      color: colors.primaryForeground,
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
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
    progressOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center",
      justifyContent: "center",
      padding: 28,
    },
    progressCard: {
      width: "100%",
      maxWidth: 360,
      borderRadius: 18,
      padding: 24,
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    progressTitle: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      textAlign: "center",
    },
    progressLabel: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
    },
    progressTrack: {
      width: "100%",
      height: 8,
      borderRadius: 4,
      overflow: "hidden",
      backgroundColor: colors.border,
    },
    progressFill: {
      height: "100%",
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    progressHint: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
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
      <Modal
        visible={completeBackupBusy}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View
          style={s.progressOverlay}
          accessibilityRole="progressbar"
          accessibilityLabel={
            completeBackupOperation === "restore"
              ? "Complete restore in progress"
              : "Complete backup in progress"
          }
        >
          <View style={s.progressCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.progressTitle}>
              {completeBackupOperation === "restore"
                ? "Restoring complete backup"
                : "Creating complete backup"}
            </Text>
            <Text style={s.progressLabel}>
              {completeBackupProgress?.label ?? "Preparing…"}
              {completeBackupProgress && completeBackupProgress.total > 0
                ? `  ${completeBackupProgress.current}/${completeBackupProgress.total}`
                : ""}
            </Text>
            {completeBackupProgress && completeBackupProgress.total > 0 && (
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    {
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          (completeBackupProgress.current / completeBackupProgress.total) * 100,
                        ),
                      )}%`,
                    },
                  ]}
                />
              </View>
            )}
            <Text style={s.progressHint}>
              Keep Memory Records open until this finishes.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={snapshotRestoreProgress !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View
          style={s.progressOverlay}
          accessibilityRole="progressbar"
          accessibilityLabel="Local snapshot restore in progress"
        >
          <View style={s.progressCard}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.progressTitle}>Restoring local snapshot</Text>
            <Text style={s.progressLabel}>
              {snapshotRestoreProgress?.stage ?? "Preparing…"}
              {snapshotRestoreProgress && snapshotRestoreProgress.total > 0
                ? `  ${snapshotRestoreProgress.current}/${snapshotRestoreProgress.total}`
                : ""}
            </Text>
            {snapshotRestoreProgress && snapshotRestoreProgress.total > 0 && (
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    {
                      width: `${Math.min(
                        100,
                        Math.max(
                          0,
                          (snapshotRestoreProgress.current / snapshotRestoreProgress.total) * 100,
                        ),
                      )}%`,
                    },
                  ]}
                />
              </View>
            )}
            <Text style={s.progressHint}>
              Keep Memory Records open until the restore finishes.
            </Text>
          </View>
        </View>
      </Modal>

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

      <UnlockModal
        visible={showUnlockModal}
        featureName="Premium Features"
        onClose={() => setShowUnlockModal(false)}
      />

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
          <Pressable
            style={s.collapsibleHeader}
            onPress={() => setTagsCollapsed((v) => !v)}
            hitSlop={6}
          >
            <Text style={s.sectionTitle}>Tags{knownTags.length > 0 ? ` (${knownTags.length})` : ""}</Text>
            <Feather
              name={tagsCollapsed ? "chevron-down" : "chevron-up"}
              size={14}
              color={colors.mutedForeground}
            />
          </Pressable>
          {!tagsCollapsed && (
            <>
              <View style={s.addTagRow}>
                <TextInput
                  style={s.addTagInput}
                  value={newTagDraft}
                  onChangeText={setNewTagDraft}
                  placeholder="new tag"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleAddTag}
                  maxLength={30}
                />
                <Pressable style={s.addTagButton} onPress={handleAddTag}>
                  <Text style={s.addTagButtonText}>Add</Text>
                </Pressable>
              </View>
              {knownTags.length === 0 ? (
                <View style={s.infoBox}>
                  <Text style={s.infoText}>No tags yet. Add your first tag above.</Text>
                </View>
              ) : (
                <View style={s.tagCloud}>
                  {knownTags.map((tag) => (
                    <View key={tag} style={s.tagPill}>
                      <Text style={s.tagPillText}>#{tag}</Text>
                      <Pressable onPress={() => handleDeleteTag(tag)} hitSlop={8}>
                        <Feather name="x" size={12} color={colors.mutedForeground} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* App lock */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>App Security</Text>
          <AppLockSettings />
        </View>

        {/* Verified local snapshots */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Local Snapshot History</Text>
          {isSnapshotTestBuild ? (
            <View style={[s.infoBox, { borderWidth: 1, borderColor: colors.primary }]}>
              <Text style={s.infoTitle}>Snapshot test build</Text>
              <Text style={s.infoText}>
                Simulated date: {new Date(settings.snapshotTestDate ?? Date.now()).toLocaleString()}{"\n"}
                Snapshot logic v{SNAPSHOT_CHANGE_LOGIC_VERSION} — date changes ignored{"\n"}
                Retention cleanup: {snapshotStatus
                  ? snapshotStatus.cleanupBlocked
                    ? "BLOCKED — incomplete inventory was detected; no snapshots will be deleted"
                    : "active"
                  : "checking…"}
              </Text>
              <View style={s.snapshotTestActions}>
                <Pressable style={s.snapshotTestButton} onPress={() => advanceSnapshotTestDate(1)}>
                  <Text style={s.snapshotTestButtonText}>Advance 1 day</Text>
                </Pressable>
                <Pressable style={s.snapshotTestButton} onPress={() => advanceSnapshotTestDate(7)}>
                  <Text style={s.snapshotTestButtonText}>Advance 7 days</Text>
                </Pressable>
                <Pressable
                  style={s.snapshotTestButton}
                  onPress={() => updateSettings({ snapshotTestDate: undefined })}
                >
                  <Text style={s.snapshotTestButtonText}>Use real time</Text>
                </Pressable>
                <Pressable
                  style={[s.snapshotTestButton, { backgroundColor: colors.destructive }]}
                  onPress={handleResetSnapshotTestHistory}
                  disabled={snapshotBusy}
                >
                  <Text style={s.snapshotTestButtonText}>Reset snapshot history</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>Balanced device-only protection</Text>
            <Text style={s.infoText}>
              Automatic snapshots run at most once per local calendar day, only after records, tags, or settings change. They wait for two quiet minutes on the Memories screen and do not start during capture, import, restore, or export. Retention keeps 7 daily, 4 weekly, and 3 monthly restore points. Snapshots stay on this device; media is deduplicated in a verified local vault.
            </Text>
          </View>
          <View style={[s.card, { marginTop: 10 }]}>
            <Pressable
              style={[s.row, s.rowBorder]}
              onPress={() => updateSettings({ automaticSnapshotsEnabled: !settings.automaticSnapshotsEnabled })}
              disabled={snapshotBusy}
            >
              <Feather
                name={settings.automaticSnapshotsEnabled ? "check-circle" : "circle"}
                size={18}
                color={settings.automaticSnapshotsEnabled ? colors.success : colors.mutedForeground}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowLabel}>Automatic snapshots</Text>
                <Text style={[s.rowValue, { fontSize: 12 }]}>
                  {settings.automaticSnapshotsEnabled ? "Enabled after two quiet minutes on the Memories screen" : "Disabled"}
                </Text>
              </View>
            </Pressable>
            <View style={[s.row, s.rowBorder]}>
              <Feather name="shield" size={17} color={colors.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowLabel}>Last successful snapshot</Text>
                <Text style={[s.rowValue, { fontSize: 12 }]}>
                  {snapshotStatus?.lastSuccessAt
                    ? new Date(snapshotStatus.lastSuccessAt).toLocaleString()
                    : snapshotStatus
                      ? "No verified snapshot yet"
                      : "Checking snapshot status…"}
                </Text>
                {snapshotStatus?.lastError ? (
                  <Text style={[s.rowValue, { fontSize: 11, color: colors.destructive }]}>
                    Last attempt failed: {snapshotStatus.lastError}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable
              style={s.row}
              onPress={handleCreateLocalSnapshot}
              disabled={snapshotBusy || automaticSnapshotRunning || Platform.OS === "web"}
              accessibilityLabel="Create local snapshot now"
              testID="create-local-snapshot-now"
            >
              <Feather name="save" size={17} color={colors.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowLabel}>Create snapshot now</Text>
                <Text style={[s.rowValue, { fontSize: 12 }]}>
                  {automaticSnapshotRunning ? "An automatic snapshot is running" : "Create a verified device-only restore point without waiting"}
                </Text>
              </View>
            </Pressable>
          </View>
          {snapshotOperationProgress ? (
            <View style={[s.infoBox, { marginTop: 10 }]} accessibilityRole="progressbar">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[s.infoTitle, { flex: 1 }]}>{snapshotOperationProgress.stage}</Text>
              </View>
              {snapshotOperationProgress.total > 0 ? (
                <>
                  <Text style={s.infoText}>
                    {snapshotOperationProgress.unit === "bytes"
                      ? `${formatBytes(snapshotOperationProgress.current)} of ${formatBytes(snapshotOperationProgress.total)}`
                      : `${snapshotOperationProgress.current} of ${snapshotOperationProgress.total}`}
                  </Text>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, {
                      width: `${Math.min(100, Math.max(0, snapshotOperationProgress.current / snapshotOperationProgress.total * 100))}%`,
                    }]} />
                  </View>
                </>
              ) : null}
              <Text style={s.infoText}>Keep the app open. You can continue using Memory Records.</Text>
            </View>
          ) : null}
          <View style={{ height: 10 }} />
          {localSnapshots.length === 0 ? (
            <View style={s.infoBox}>
              <Text style={s.infoText}>No retained snapshots yet. Leave the Memories screen open for two quiet minutes after a change, or use Create snapshot now.</Text>
            </View>
          ) : (
            <View style={s.card}>
              {localSnapshots.map((snapshot, index) => (
                <View key={snapshot.id} style={[s.snapshotRow, index < localSnapshots.length - 1 && s.rowBorder]}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.rowLabel}>{new Date(snapshot.createdAt).toLocaleString()}</Text>
                    <Text style={[s.rowValue, { fontSize: 12 }]}>
                      {snapshot.status === "verified" ? "Verified" : "Invalid"} · {snapshot.recordCount} records · {snapshot.mediaCount} media
                    </Text>
                  </View>
                  <Pressable
                    style={s.snapshotAction}
                    onPress={() => handleRestoreLocalSnapshot(snapshot)}
                    disabled={snapshotBusy || snapshot.status !== "verified"}
                    accessibilityLabel="Restore local snapshot"
                  >
                    <Feather name="rotate-ccw" size={16} color={snapshot.status === "verified" ? colors.primary : colors.mutedForeground} />
                  </Pressable>
                  <Pressable
                    style={s.snapshotAction}
                    onPress={() => handleDeleteLocalSnapshot(snapshot)}
                    disabled={snapshotBusy}
                    accessibilityLabel="Delete local snapshot"
                  >
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

        {/* Premium Features Unlock */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Premium Features</Text>
          <View style={s.card}>
            <Pressable
              style={[s.row, { gap: 12 }]}
              onPress={isPremiumUnlocked ? undefined : () => setShowUnlockModal(true)}
            >
              <Feather
                name={isPremiumUnlocked ? "unlock" : "lock"}
                size={16}
                color={isPremiumUnlocked ? colors.success : colors.historicalForeground}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowLabel}>AI Interviewer, Historical Events & Voice Memos</Text>
                <Text style={[s.rowValue, { fontSize: 12, color: isPremiumUnlocked ? colors.success : colors.mutedForeground }]}>
                  {isPremiumUnlocked ? "Unlocked — all premium features active" : "Locked — €10 contribution required"}
                </Text>
              </View>
              {!isPremiumUnlocked && (
                <View style={{ backgroundColor: colors.historical, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.historicalBorder }}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 12, color: colors.historicalForeground }}>Unlock</Text>
                </View>
              )}
              {isPremiumUnlocked && (
                <Pressable
                  hitSlop={8}
                  onPress={checkStatus}
                  disabled={isChecking}
                >
                  <Feather name="refresh-cw" size={14} color={isChecking ? colors.mutedForeground : colors.primary} />
                </Pressable>
              )}
            </Pressable>
          </View>
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

        {/* Historical Events */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Historical Events</Text>
          <View style={s.infoBox}>
            <Text style={s.infoTitle}>AI-generated year context</Text>
            <Text style={s.infoText}>
              On any record that has a Memory Year set, tap{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>Generate [year] events</Text> to
              create AI-written summaries of major events from that year.{"\n\n"}
              International events have worldwide scope; national events are tied to your chosen
              voice-to-text language country. Set a count to 0 to disable that type.
              Generated notes appear highlighted in amber in your list.
            </Text>
          </View>
          <View style={{ height: 12 }} />
          <View style={s.card}>
            {/* International stepper */}
            <View style={[s.row, s.rowBorder]}>
              <Feather name="globe" size={16} color={colors.primary} />
              <Text style={s.rowLabel}>International events</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={() => handleEventCount("international", -1)}
                  disabled={(settings.maxInternationalEvents ?? 2) <= 0}
                  hitSlop={8}
                  style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                    alignItems: "center", justifyContent: "center",
                    opacity: (settings.maxInternationalEvents ?? 2) <= 0 ? 0.35 : 1,
                  }}
                >
                  <Feather name="minus" size={14} color={colors.foreground} />
                </Pressable>
                <Text style={{ fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground, minWidth: 20, textAlign: "center" }}>
                  {settings.maxInternationalEvents ?? 2}
                </Text>
                <Pressable
                  onPress={() => handleEventCount("international", +1)}
                  disabled={(settings.maxInternationalEvents ?? 2) >= 5}
                  hitSlop={8}
                  style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                    alignItems: "center", justifyContent: "center",
                    opacity: (settings.maxInternationalEvents ?? 2) >= 5 ? 0.35 : 1,
                  }}
                >
                  <Feather name="plus" size={14} color={colors.foreground} />
                </Pressable>
              </View>
            </View>
            {/* National stepper */}
            <View style={s.row}>
              <Feather name="flag" size={16} color={colors.primary} />
              <Text style={s.rowLabel}>National events</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable
                  onPress={() => handleEventCount("national", -1)}
                  disabled={(settings.maxNationalEvents ?? 2) <= 0}
                  hitSlop={8}
                  style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                    alignItems: "center", justifyContent: "center",
                    opacity: (settings.maxNationalEvents ?? 2) <= 0 ? 0.35 : 1,
                  }}
                >
                  <Feather name="minus" size={14} color={colors.foreground} />
                </Pressable>
                <Text style={{ fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground, minWidth: 20, textAlign: "center" }}>
                  {settings.maxNationalEvents ?? 2}
                </Text>
                <Pressable
                  onPress={() => handleEventCount("national", +1)}
                  disabled={(settings.maxNationalEvents ?? 2) >= 5}
                  hitSlop={8}
                  style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                    alignItems: "center", justifyContent: "center",
                    opacity: (settings.maxNationalEvents ?? 2) >= 5 ? 0.35 : 1,
                  }}
                >
                  <Feather name="plus" size={14} color={colors.foreground} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* Backup */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Backup & Restore</Text>
          {completeBackupReminder?.due && (
            <View
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.primary,
                borderRadius: colors.radius,
                padding: 14,
                gap: 10,
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Feather name="alert-triangle" size={19} color={colors.primary} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.rowLabel}>Complete backup recommended</Text>
                  <Text style={s.rowValue}>
                    {completeBackupReminder.reason === "never-backed-up"
                      ? "Your memories and attached media have not yet been saved in a portable complete backup."
                      : completeBackupReminder.reason === "restore"
                        ? "Your data was restored or recovered. Create a fresh complete backup of the current library."
                        : completeBackupReminder.reason === "changes"
                          ? `${completeBackupReminder.changedRecordCount} memories have been created or edited since your last complete backup.`
                          : `Your last complete backup was ${completeBackupReminder.lastSuccessfulBackupAt
                            ? new Date(completeBackupReminder.lastSuccessfulBackupAt).toLocaleDateString()
                            : "more than 30 days ago"}.`}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  style={[s.modalBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCreateCompleteBackup}
                  disabled={completeBackupBusy}
                >
                  <Text style={[s.modalBtnText, { color: colors.primaryForeground }]}>
                    Create Backup
                  </Text>
                </Pressable>
                <Pressable
                  style={[s.modalBtn, { backgroundColor: colors.muted }]}
                  onPress={() => {
                    snoozeCompleteBackupReminder()
                      .then(refreshCompleteBackupReminder)
                      .catch(() => {});
                  }}
                >
                  <Text style={[s.modalBtnText, { color: colors.foreground }]}>
                    Remind Me Later
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
          <View style={s.infoBox}>
            <Text style={s.infoText}>
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>Complete backup</Text> creates one portable Android archive containing records, settings, photos, videos, thumbnails, and voice memos.{"\n\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>JSON backup</Text> remains available as a small, portable records-and-tags backup, but it does not contain media files. Import merges a backup without deleting unrelated records.{"\n\n"}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>Import from Obsidian</Text> opens a file picker — navigate to your Obsidian vault folder and select one or more .md files.{"\n"}
              • Android / Samsung: tap the{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>☰ menu → Internal storage</Text>, then find{" "}
              <Text style={{ fontFamily: "Inter_600SemiBold" }}>Obsidian → [vault] → Memory Records</Text>.{"\n"}
              • iPhone: tap <Text style={{ fontFamily: "Inter_600SemiBold" }}>Browse → On My iPhone → Obsidian</Text>{" "}
              (or <Text style={{ fontFamily: "Inter_600SemiBold" }}>iCloud Drive → Obsidian</Text>).
            </Text>
          </View>
          <View style={s.card}>
            <Pressable
              style={[s.row, s.rowBorder, completeBackupBusy && { opacity: 0.55 }]}
              onPress={handleCreateCompleteBackup}
              disabled={completeBackupBusy}
            >
              <Feather name="archive" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>
                  {completeBackupProgress
                    ? `${completeBackupProgress.label} ${completeBackupProgress.current}/${completeBackupProgress.total}`
                    : "Create complete backup"}
                </Text>
                <Text style={s.rowValue}>Records, settings, and all accessible media</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
            <Pressable
              style={[s.row, s.rowBorder, completeBackupBusy && { opacity: 0.55 }]}
              onPress={handleRestoreCompleteBackup}
              disabled={completeBackupBusy}
            >
              <Feather name="folder-plus" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Restore complete backup</Text>
                <Text style={s.rowValue}>Select a .mrbak archive</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
            {canRecoverPreviousExpoGoData && (
              <Pressable
                style={[s.row, s.rowBorder, recoveringPreviousData && { opacity: 0.55 }]}
                onPress={handlePreviousDataRecovery}
                disabled={recoveringPreviousData}
              >
                <Feather name="rotate-ccw" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={s.rowLabel}>
                    {recoveringPreviousData ? "Scanning previous app data…" : "Recover previous Expo Go data"}
                  </Text>
                  <Text style={s.rowValue}>One-time recovery after an SDK or project update</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            )}
            <Pressable style={[s.row, s.rowBorder]} onPress={handleExport}>
              <Feather name="upload" size={18} color={colors.primary} />
              <Text style={s.rowLabel}>Export JSON backup</Text>
              <Text style={s.rowValue}>{records.length} record{records.length !== 1 ? "s" : ""}</Text>
            </Pressable>
            <Pressable style={[s.row, s.rowBorder]} onPress={() => { setImportText(""); setImportModalVisible(true); }}>
              <Feather name="download" size={18} color={colors.primary} />
              <Text style={s.rowLabel}>Import from JSON backup</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
            {settings.configured && (
              <Pressable
                style={[s.row, s.rowBorder, exportingToObsidian && { opacity: 0.55 }]}
                onPress={handleExportAllToObsidian}
                disabled={exportingToObsidian}
              >
                <Feather name="upload" size={18} color={colors.primary} />
                <Text style={s.rowLabel}>
                  {exportingToObsidian
                    ? exportProgress && exportProgress.current > 0
                      ? `Writing ${exportProgress.current} / ${exportProgress.total}…`
                      : "Preparing…"
                    : `Export all ${records.length} note${records.length !== 1 ? "s" : ""} to Obsidian`}
                </Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </Pressable>
            )}
            <Pressable style={s.row} onPress={handleObsidianImport}>
              <Feather name="file-text" size={18} color={colors.primary} />
              <Text style={s.rowLabel}>Import from Obsidian notes</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        {/* Storage */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Storage</Text>
          <View style={s.card}>
            <View style={[s.row, s.rowBorder]}>
              <Feather name="video" size={18} color={colors.primary} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowLabel}>Saved videos</Text>
                <Text style={[s.rowValue, { fontSize: 12 }]}>
                  {videoStorage === null
                    ? "Calculating…"
                    : videoStorage.fileCount === 0
                    ? "No videos saved"
                    : `${videoStorage.fileCount} file${videoStorage.fileCount !== 1 ? "s" : ""}`}
                </Text>
              </View>
              <Text style={[s.rowValue, { fontFamily: "Inter_600SemiBold", color: colors.foreground }]}>
                {videoStorage === null ? "—" : formatBytes(videoStorage.bytes)}
              </Text>
            </View>
            <View style={s.row}>
              <Feather name="hard-drive" size={18} color={colors.mutedForeground} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[s.rowLabel, { color: colors.mutedForeground }]}>Total records</Text>
                <Text style={[s.rowValue, { fontSize: 12 }]}>Stored in app documents folder</Text>
              </View>
              <Text style={s.rowValue}>{records.length}</Text>
            </View>
          </View>
          {videoStorage !== null && videoStorage.bytes > 0 && (
            <View style={[s.infoBox, { marginTop: 10 }]}>
              <Text style={s.infoText}>
                Videos are saved privately in the app's documents folder. Delete individual records to free up space.
              </Text>
            </View>
          )}
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
