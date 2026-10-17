import { Feather } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { copyAudioToAppStorage, deleteAppAudio } from "@/utils/storage";

interface Props {
  audioUri?: string;
  onSaved: (uri: string) => void;
  onDeleted: () => void;
}

export function VoiceMemoRecorder({ audioUri, onSaved, onDeleted }: Props) {
  const colors = useColors();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };

  const startRecording = async () => {
    try {
      setIsLoading(true);
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert("Permission Required", "Allow microphone access to record voice memos.");
        setIsLoading(false);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setElapsed(0);
      setIsLoading(false);
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      Alert.alert("Error", "Could not start recording. Please try again.");
      setIsLoading(false);
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    try {
      setIsLoading(true);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      setIsRecording(false);
      setIsLoading(false);
      if (!uri) return;
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const ext = uri.split(".").pop()?.split("?")[0] ?? "m4a";
      const destUri = await copyAudioToAppStorage(uri, ext);
      onSaved(destUri);
    } catch {
      Alert.alert("Error", "Could not save recording. Please try again.");
      setIsLoading(false);
    }
  };

  const handlePress = async () => {
    if (isLoading) return;
    if (isRecording) {
      await stopRecording();
      return;
    }
    if (audioUri) {
      Alert.alert("Replace voice memo?", "The existing recording will be deleted.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace",
          style: "destructive",
          onPress: async () => {
            await deleteAppAudio(audioUri);
            onDeleted();
            await startRecording();
          },
        },
      ]);
    } else {
      await startRecording();
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete voice memo?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (audioUri) await deleteAppAudio(audioUri);
          onDeleted();
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const s = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    micBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isRecording ? "#ef4444" : colors.surface,
      borderWidth: 1.5,
      borderColor: isRecording ? "#ef4444" : colors.border,
    },
    label: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: isRecording ? "#ef4444" : colors.mutedForeground,
    },
    timer: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: "#ef4444",
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
  });

  return (
    <View style={s.row}>
      <Pressable style={s.micBtn} onPress={handlePress} disabled={isLoading}>
        <Feather
          name={isRecording ? "square" : "mic"}
          size={20}
          color={isRecording ? "#fff" : colors.mutedForeground}
        />
      </Pressable>
      {isRecording ? (
        <>
          <Text style={s.label}>Recording… tap to stop</Text>
          <Text style={s.timer}>{formatElapsed(elapsed)}</Text>
        </>
      ) : audioUri ? (
        <>
          <Text style={s.label}>Voice memo recorded · tap to replace</Text>
          <Pressable style={s.iconBtn} onPress={handleDelete} hitSlop={8}>
            <Feather name="trash-2" size={14} color={colors.mutedForeground} />
          </Pressable>
        </>
      ) : (
        <Text style={s.label}>
          {isLoading ? "Starting…" : "Tap to record a voice memo"}
        </Text>
      )}
    </View>
  );
}
