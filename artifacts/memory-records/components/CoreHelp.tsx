import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function CoreHelp() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const text = { color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 23 };
  const sections = [
    ["Capture a memory", "Create a text, photo, or video memory. Add its date, optional memory year, tags, emotion, and location. Dictate text using the existing Dictate control. Save to keep the memory on this device."],
    ["Find and revisit memories", "Search notes and metadata, sort or group by date, tag, emotion, or year, and reorder memories within a year. Surprise Me opens a memory dated before today."],
    ["Photos and locations", "Gallery photos can supply GPS coordinates when the operating system makes them available. You can optionally use the phone's current location instead; this may not be where a photo was taken. The Map screen is temporarily disabled."],
    ["Share an image card", "Open a memory and choose Share as image card. The card uses a photo when available, or emotion artwork otherwise, with a note excerpt and date. The system share sheet lets you choose where to send it."],
    ["Protect access", "Settings → App Security offers a biometric app lock with a PIN fallback. Keep your PIN private. This local lock is not an online account or proof of ownership."],
    ["Local snapshots", "Automatic checks wait for two quiet foreground minutes on the Memories screen after a change. Capture, import, restore, and export defer the check. Settings → Local Snapshot History lets you create a verified snapshot now, restore a point, or delete an older one. Snapshots stay on the device and are not a portable backup."],
    ["Complete backup and restore", "Settings → Backup & Restore creates a .mrbak archive containing records, settings, and all accessible media. On Android, select a destination folder. Keep a copy outside this phone. Restore validates the archive and media before merging; matching IDs return to the backup version while unrelated records remain. Keep the original installation until a transferred backup is verified."],
    ["JSON export and import", "JSON backup remains free and portable. It contains records and tags, but not photo, video, or audio file contents. Import merges records instead of deleting unrelated ones. Obsidian/Markdown import is not part of this edition."],
    ["Free edition scope", "This is the free core edition: no advertisements, purchase flow, payment recovery, activation codes, donation links, or support checkout. Voice memos, AI tools, and Obsidian integration are not available here. Restoring a full-edition backup preserves its media and metadata, but does not enable those features."],
    ["Privacy", "Memories are stored locally. Selecting media and sharing or exporting a record involve the services you choose. This edition does not contact the premium unlock API or AI services. Device backups and third-party share destinations have their own policies."],
  ];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ padding: 20, flexDirection: "row", gap: 12 }}>
        <Feather name="arrow-left" size={24} color={colors.foreground} />
        <Text style={[text, { fontFamily: "Inter_600SemiBold", fontSize: 19 }]}>Memory Records Free — Guide</Text>
      </Pressable>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
        {sections.map(([title, body]) => (
          <View key={title} style={{ marginBottom: 24 }}>
            <Text style={[text, { fontFamily: "Inter_600SemiBold", fontSize: 17, marginBottom: 8 }]}>{title}</Text>
            <Text style={text}>{body}</Text>
          </View>
        ))}
        <Text style={text}>Open-source software licensed GPL-3.0-only.</Text>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://github.com/Marcseb/Memory-records/tree/google-play-free")} style={styles.link}>
          <Text style={[text, { color: colors.primary }]}>Source code for this edition</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL("https://www.gnu.org/licenses/gpl-3.0.html")} style={styles.link}>
          <Text style={[text, { color: colors.primary }]}>GNU GPL version 3</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({ link: { paddingVertical: 12 } });
