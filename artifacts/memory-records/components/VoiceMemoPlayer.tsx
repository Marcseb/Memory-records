import { Feather } from "@expo/vector-icons";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  uri: string;
}

export function VoiceMemoPlayer({ uri }: Props) {
  const colors = useColors();
  const player = useAudioPlayer(uri, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
  }, []);

  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0).catch(() => {});
  }, [player, status.didJustFinish]);

  const togglePlay = () => {
    if (!status.isLoaded) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    try {
      if (status.playing) {
        player.pause();
      } else {
        player.play();
      }
    } catch { /* ignore */ }
  };

  const handleSeek = async (locationX: number) => {
    if (!status.isLoaded || status.duration === 0 || barWidth === 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / barWidth));
    await player.seekTo(ratio * status.duration);
  };

  const formatMs = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60).toString().padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const position = status.currentTime * 1000;
  const duration = status.duration * 1000;
  const progress = duration > 0 ? position / duration : 0;

  const s = StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
    },
    playBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    trackArea: { flex: 1, gap: 5 },
    progressTrack: {
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
    },
    progressFill: {
      height: 4,
      backgroundColor: colors.primary,
      borderRadius: 2,
      width: `${Math.round(progress * 100)}%` as any,
    },
    times: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    timeText: {
      fontSize: 10,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    label: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 2,
    },
  });

  return (
    <View style={s.container}>
      <Pressable style={s.playBtn} onPress={togglePlay}>
        <Feather name={status.playing ? "pause" : "play"} size={15} color="#fff" />
      </Pressable>
      <View style={s.trackArea}>
        <Text style={s.label}>🎙 Voice memo</Text>
        <Pressable
          style={s.progressTrack}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onPress={(e) => handleSeek(e.nativeEvent.locationX)}
        >
          <View style={s.progressFill} />
        </Pressable>
        <View style={s.times}>
          <Text style={s.timeText}>{formatMs(position)}</Text>
          <Text style={s.timeText}>{formatMs(duration)}</Text>
        </View>
      </View>
    </View>
  );
}
