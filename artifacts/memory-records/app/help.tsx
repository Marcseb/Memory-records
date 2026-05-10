import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

interface SectionProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  children: React.ReactNode;
}

function Section({ icon, title, children }: SectionProps) {
  const colors = useColors();
  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: colors.primary + "18",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={icon} size={16} color={colors.primary} />
        </View>
        <Text
          style={{
            fontSize: 15,
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
          }}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

interface BulletProps {
  children: React.ReactNode;
}

function Bullet({ children }: BulletProps) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 7 }}>
      <Text style={{ color: colors.primary, fontSize: 14, lineHeight: 21, marginTop: 1 }}>•</Text>
      <Text
        style={{
          flex: 1,
          fontSize: 14,
          fontFamily: "Inter_400Regular",
          color: colors.mutedForeground,
          lineHeight: 21,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

interface InfoBoxProps {
  children: React.ReactNode;
}

function InfoBox({ children }: InfoBoxProps) {
  const colors = useColors();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: colors.radius,
        padding: 14,
        borderLeftWidth: 3,
        borderLeftColor: colors.primary,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontFamily: "Inter_400Regular",
          color: colors.mutedForeground,
          lineHeight: 20,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export default function HelpScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    headerTitle: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: 20,
      paddingTop: 28,
      paddingBottom: 60,
    },
    intro: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 23,
      marginBottom: 32,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginBottom: 28,
    },
    strong: {
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    footerNote: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 18,
      marginTop: 8,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Help & About</Text>
        <Pressable style={s.closeBtn} onPress={() => router.back()} hitSlop={8}>
          <Feather name="x" size={18} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>

        <Text style={s.intro}>
          <Text style={s.strong}>Memory Records</Text> is a personal memory journaling app that runs entirely on your device. Capture moments with photos, voice, or text — then save them to your Obsidian vault for long-term archiving. No account required, no cloud sync, no data ever leaves your phone unless you explicitly share it.
        </Text>

        <View style={s.divider} />

        <Section icon="camera" title="Capturing memories">
          <Bullet>
            <Text style={s.strong}>Photo from gallery</Text> — pick any photo and the app automatically reads its EXIF metadata: date taken, GPS coordinates, and location name. You don't need to fill anything in manually.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Clipboard paste</Text> — paste a screenshot or image copied from another app. If no EXIF date is found, the app prompts you to enter one.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Text-only note</Text> — write a note without any photo. Useful for thoughts, conversations, or memories with no picture.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Voice-to-text</Text> — tap the microphone to dictate your note hands-free. Speech recognition runs on-device in your chosen language (French, Italian, or English).
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Tags</Text> — add one or more tags to organise memories by theme, person, or place. Tags are shared across all records and manageable in Settings.
          </Bullet>
        </Section>

        <Section icon="cpu" title="AI Interviewer">
          <Bullet>
            An optional AI agent guides you through a series of warm, open-ended questions to help you recall richer details about a memory — dates, emotions, people, sensory impressions.
          </Bullet>
          <Bullet>
            Works with <Text style={s.strong}>Mistral</Text> (recommended, free tier available at console.mistral.ai) or <Text style={s.strong}>OpenAI</Text> as a fallback.
          </Bullet>
          <Bullet>
            Your API key is stored <Text style={s.strong}>encrypted on this device only</Text> — it is never sent to any server other than Mistral or OpenAI directly when you start an interview.
          </Bullet>
          <View style={{ height: 10 }} />
          <InfoBox>
            To use the AI Interviewer, go to <Text style={{ fontFamily: "Inter_600SemiBold" }}>Settings → AI Interviewer</Text> and enter your own Mistral or OpenAI API key.
          </InfoBox>
        </Section>

        <Section icon="book-open" title="Obsidian integration">
          <Bullet>
            Memory Records can save notes directly into your <Text style={s.strong}>Obsidian vault</Text> as Markdown files — formatted, dated, and tagged — using the <Text style={s.strong}>Actions URI</Text> community plugin.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Setup:</Text> in Obsidian, go to Settings → Community Plugins → Browse → search "Actions URI" → Install and Enable.
          </Bullet>
          <Bullet>
            In <Text style={s.strong}>Settings → Obsidian Integration</Text>, enter your vault name and the folder where notes should be saved (default: "Memory Records").
          </Bullet>
          <Bullet>
            On the record detail screen, tap <Text style={s.strong}>Save to Obsidian</Text> — the app opens Obsidian via a deep link and creates the note automatically. Both apps must be installed on the same device.
          </Bullet>
          <View style={{ height: 10 }} />
          <InfoBox>
            Each note includes the date, year, tags, GPS coordinates, location name, and your full text. Notes are formatted in Markdown and are fully readable and searchable inside Obsidian.
          </InfoBox>
        </Section>

        <Section icon="archive" title="Backup & restore">
          <Bullet>
            <Text style={s.strong}>JSON export</Text> — tap Export in Settings to share a complete backup of all your records and tags as a JSON file. Save it to your Files app, iCloud, Google Drive, or send it anywhere via the share sheet.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>JSON import</Text> — paste a JSON backup into the Import panel. Records are merged with existing ones — nothing is deleted. Duplicates are avoided by ID.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Import from Obsidian</Text> — if you have previously saved notes to Obsidian, you can reimport them. On Android, pick the vault folder directly; on iOS, use the Files app to select individual Markdown files. The app recognises and parses the Memory Records note format automatically.
          </Bullet>
          <View style={{ height: 10 }} />
          <InfoBox>
            Regular JSON exports are the recommended backup strategy. Store them somewhere safe — if you uninstall the app or change device, a JSON backup lets you restore everything instantly.
          </InfoBox>
        </Section>

        <Section icon="shield" title="Privacy & security">
          <Bullet>
            <Text style={s.strong}>All data stays on your device.</Text> Records, photos, tags, and settings are stored in your phone's local storage (AsyncStorage). Nothing is uploaded to any server.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Encrypted key storage.</Text> Your AI API keys are stored using the device's secure enclave (expo-secure-store), the same mechanism used by banking apps. They are never written to plain storage.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>No shared database.</Text> Each installation of the app is fully independent. One user cannot see another user's records.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Local authentication.</Text> Your login credentials are stored locally on this device and are never sent to a remote server.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>AI calls are direct.</Text> When the AI Interviewer is active, your messages go directly from your device to Mistral or OpenAI using your own key — no intermediary server reads them.
          </Bullet>
        </Section>

        <View style={s.divider} />

        <Text style={s.footerNote}>Memory Records v1.0{"\n"}Built with Expo · All data local · No tracking</Text>
      </ScrollView>
    </View>
  );
}
