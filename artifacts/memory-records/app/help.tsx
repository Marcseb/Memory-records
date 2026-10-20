import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const BMAC_URL   = "https://buymeacoffee.com/marcsebastien";
const PAYPAL_URL = "https://www.paypal.com/donate/?business=7AUYVWJE39NMQ&no_recurring=0&item_name=Building+open+source+apps+that+are+secure%2C+practical%2C+and+keep+your+data+local%E2%80%94not+in+the+cloud.&currency_code=EUR";
const GITHUB_URL = "https://github.com/Marcseb/Memory-records";
const GPL_URL = "https://www.gnu.org/licenses/gpl-3.0.html";

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
    licenseLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 13,
      paddingHorizontal: 14,
      marginTop: 10,
    },
    licenseLinkText: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
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
          <Text style={s.strong}>Memory Records</Text> is a personal memory journaling app that runs entirely on your device. Capture moments with photos, voice memos, or text — then save them to your Obsidian vault for long-term archiving. Your local profile stays on the device, there is no cloud sync, and no data leaves your phone unless you explicitly use an AI feature or share/export it.
        </Text>

        <View style={s.divider} />

        <Section icon="camera" title="Capturing memories">
          <Bullet>
            <Text style={s.strong}>Photo from gallery</Text> — pick any photo and the app reads available EXIF metadata, including the date and GPS coordinates when the device exposes them. If no date is available, enter it manually. On Android, if photo GPS cannot be read, the app may offer the phone's current location; this is optional and may differ from where the photo was taken. Tap the photo on the detail screen to view it full-screen. A camera icon overlay on any card lets you replace the photo at any time.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Video clip</Text> — pick a short video from your gallery. The first frame is extracted as a thumbnail shown on the card and detail screen. Tap the thumbnail to play the video in a full-screen player with native controls. Video clips are included in the free core features.
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
            <Text style={s.strong}>Voice memos</Text> <Text style={[s.strong, { color: colors.primary }]}>(Premium)</Text> — unlock Premium Features to record an audio clip in the Voice Memo section below the note. Play, pause, seek, replace, or delete it from the record. Audio stays local; records with a memo show a speaker icon and receive the searchable <Text style={s.strong}>#voice-memo</Text> tag automatically.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Tags</Text> — add one or more tags to organise memories by theme, person, or place. The new-record picker uses a compact horizontal chip row. Settings has a collapsible tag section with compact chips, direct deletion, and a new-tag input.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Emotion tags</Text> — attach one of 22 colour-coded emotions (joy, nostalgia, gratitude, grief, …) to each memory. Emotions appear on the record card and can be used to group and filter the home list.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Memory Year</Text> — optionally record the year the memory is from (e.g. 1998), independently of today's date. Useful when journaling old photos or past events. Used for chronological sorting.
          </Bullet>
        </Section>

        <Section icon="list" title="Sorting & browsing">
          <Bullet>
            The home list offers four sort modes, toggled with the pill bar at the top of the screen.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Folder</Text> — grouped by primary tag, collapsed or expanded per group.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Emotion</Text> — grouped by emotion, each group shown in its colour.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Added</Text> — flat list, newest-added first (by when the record was created in the app).
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Date</Text> — flat list sorted by Memory Year, most recent first. Records without a year appear at the bottom.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Search</Text> — use the search field at the top of Home to find memories by note text, tag, emotion, or location. Grouped results expand automatically while searching, and <Text style={s.strong}>voice-memo</Text> finds every record with an audio clip.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Year rank reordering (Date mode)</Text> — in Date sort, each card shows its position within its year group as <Text style={s.strong}>N/M</Text> (e.g. 2/5). A column of controls appears on the right: ↑ and ↓ arrows to move the note one step within its year, and a delete button. The first move automatically assigns ranks to all notes in that year based on their current order. Ranks are saved and survive restarts.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Map</Text> — open the Map tab to see memories with saved GPS coordinates. Pins use the memory's emotion colour; tap a pin or callout to open the record.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Surprise Me</Text> — tap the shuffle button on Home to open a random memory dated before today.
          </Bullet>
        </Section>

        <Section icon="share-2" title="Sharing a memory">
          <Bullet>
            On a record's detail screen, tap <Text style={s.strong}>Share as image card</Text>. The card uses the record's photo when available, or its emotion artwork otherwise, and includes a note excerpt and date. It opens the phone's system share sheet.
          </Bullet>
        </Section>

        <Section icon="lock" title="Unlocking Premium Features">
          <Bullet>
            The <Text style={s.strong}>AI Interviewer</Text>, <Text style={s.strong}>Historical Events</Text> generator, and <Text style={s.strong}>Voice Memos</Text> are grouped into a Premium feature pack, unlocked by a one-time <Text style={s.strong}>€10 contribution via PayPal</Text>. Video clips and all other core features — capturing memories, sorting, search, tags, emotions, year ranks, Obsidian export, JSON backup — remain free.
          </Bullet>
          <Bullet>
            Open <Text style={s.strong}>Settings → Premium Features</Text> and tap <Text style={s.strong}>Unlock</Text>, or tap the lock icon on the <Text style={s.strong}>Start interview</Text> toggle, <Text style={s.strong}>Generate [year] events</Text> button, or Voice Memo control. The unlock sheet appears.
          </Bullet>
          <Bullet>
            The sheet shows your <Text style={s.strong}>device ID</Text> — a unique token tied to this installation. Copy it or note it.
          </Bullet>
          <Bullet>
            Tap <Text style={s.strong}>Contribute €10 via PayPal</Text>. A pre-filled PayPal form opens in your browser. In the PayPal message field, include your device ID so the payment can be matched automatically.
          </Bullet>
          <Bullet>
            After completing the payment, return to the app and tap <Text style={s.strong}>I've paid — check payment status</Text>. Enter the email address used for PayPal. The app matches the completed payment and unlocks the AI Interviewer, Historical Events, and Voice Memos immediately.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Activation code alternative</Text> — send your device ID to the developer (contact via GitHub). Once your payment is verified manually, you'll receive a code in the format <Text style={s.strong}>MR-XXXXXXXX</Text>. Tap <Text style={s.strong}>I have an activation code</Text>, enter it, and tap <Text style={s.strong}>Activate</Text>.
          </Bullet>
          <Bullet>
            The unlock is <Text style={s.strong}>permanent for this device</Text> — no subscription, no renewal. Existing unlocks remain valid. If you reinstall the app, tap Check payment status or re-enter your activation code to restore access.
          </Bullet>
          <View style={{ height: 10 }} />
          <InfoBox>
            Only the device token, payment timestamp, and a SHA-256 hash of the PayPal email are stored server-side. The email address itself and your name are not stored.
          </InfoBox>
        </Section>

        <Section icon="cpu" title="AI Interviewer">
          <Bullet>
            An optional AI agent guides you through a series of warm, open-ended questions to help you recall richer details about a memory — dates, emotions, people, sensory impressions.
          </Bullet>
          <Bullet>
            Works with <Text style={s.strong}>Mistral</Text> (recommended, free tier available at console.mistral.ai) or <Text style={s.strong}>OpenAI</Text> as a fallback.
          </Bullet>
          <Bullet>
            On the New Memory screen, scroll to <Text style={s.strong}>AI Interviewer</Text> and tap <Text style={s.strong}>Start interview</Text>. The AI asks one focused question at a time — type or dictate your answer in the Note field, tap <Text style={s.strong}>Next question</Text>, and each answer is saved as a separate note.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Context notes (up to 3)</Text> — before starting, tap <Text style={s.strong}>Add context</Text> to select up to 3 existing memories as background. The AI reads them to ask more connected questions, referencing recurring people, places, or themes across your records.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Continuing from an existing record</Text> — on any record's detail screen, tap <Text style={s.strong}>New note</Text>. The new memory screen opens pre-seeded with that record's context. Add context notes if you like, then tap <Text style={s.strong}>Start interview</Text> to begin a session anchored to that memory.
          </Bullet>
          <Bullet>
            Select tags before starting to keep every question focused on a specific theme (family, travel, work, etc.).
          </Bullet>
          <Bullet>
            Your API key is stored <Text style={s.strong}>encrypted on this device only</Text> — it is never sent to any server other than Mistral or OpenAI directly when you start an interview.
          </Bullet>
          <View style={{ height: 10 }} />
          <InfoBox>
            To use the AI Interviewer, go to <Text style={{ fontFamily: "Inter_600SemiBold" }}>Settings → AI Interviewer</Text> and enter your own Mistral or OpenAI API key.
          </InfoBox>
        </Section>

        <Section icon="globe" title="Historical Events">
          <Bullet>
            On any record that has a <Text style={s.strong}>Memory Year</Text> set, the detail screen shows a <Text style={s.strong}>Generate [year] events</Text> button. Tap it to have the AI produce summaries of the most significant events from that year — both worldwide and in your country — written in your chosen language.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>🌐 International events</Text> — worldwide or global scope, not specific to any one country.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>🏛️ National events</Text> — tied to the country of your voice-to-text language: French → France, Italian → Italy, English → United States.
          </Bullet>
          <Bullet>
            Each event is saved as a standard memory record with a ~10-sentence summary covering historical background, key actors, what happened, immediate consequences, and long-term significance — all written in your chosen app language.
          </Bullet>
          <Bullet>
            Generated notes share the same <Text style={s.strong}>Memory Year</Text> as the source record and carry the tag <Text style={s.strong}>#historical</Text>, so they appear grouped beside your personal memory in Date sort mode.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Amber highlight</Text> — historical event cards have a warm amber background and golden border that makes them instantly distinguishable from personal notes at a glance.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Settings → Historical Events</Text> — two steppers (0 – 5) let you set how many international and national events are generated per trigger. Set either to 0 to disable that type entirely.
          </Bullet>
          <Bullet>
            Historical notes have the same capabilities as personal notes: editable, saveable to Obsidian, and included in JSON exports and imports. The event type is preserved in Obsidian Markdown and restored on re-import.
          </Bullet>
          <View style={{ height: 10 }} />
          <InfoBox>
            Historical Events require a Mistral or OpenAI API key configured in{" "}
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>Settings → AI Interviewer</Text>.
            The button only appears on records that have a Memory Year set, and is hidden on historical event records themselves.
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
          <Bullet>
            <Text style={s.strong}>Bulk export</Text> — in Settings → Obsidian Integration, tap <Text style={s.strong}>Export all N notes to Obsidian</Text> to export everything at once. On Android a folder picker opens and the app writes files directly into your vault (a live counter shows progress). On iPhone a ZIP is created and shared via the share sheet — save it to Files, tap it to extract, then move the folder into your vault. A step-by-step guide appears automatically after sharing.
          </Bullet>
          <View style={{ height: 10 }} />
          <InfoBox>
            Each note includes the date, memory year, tags, emotion, available photo path, GPS coordinates when present, location name, and your full text. Notes are formatted in Markdown and are fully readable and searchable inside Obsidian. Voice memo files remain in the app's local storage and are not embedded in the Markdown export.{"\n\n"}
            File names use the format <Text style={{ fontFamily: "Inter_600SemiBold" }}>YYYY-MM-DD[_tag][_year].md</Text> so they sort naturally in Obsidian's file tree.{"\n\n"}
            <Text style={{ fontFamily: "Inter_600SemiBold" }}>Import from Obsidian</Text> — if you have previously saved notes to Obsidian, you can reimport them. A file picker lets you select one or more .md files from your vault.{"\n"}
            • Android / Samsung: tap the <Text style={{ fontFamily: "Inter_600SemiBold" }}>☰ menu → Internal storage</Text>, then find <Text style={{ fontFamily: "Inter_600SemiBold" }}>Obsidian → [vault] → Memory Records</Text>.{"\n"}
            • iPhone: tap <Text style={{ fontFamily: "Inter_600SemiBold" }}>Browse → On My iPhone → Obsidian</Text> (or iCloud Drive → Obsidian).
          </InfoBox>
        </Section>

        <Section icon="archive" title="Backup & restore">
          <Bullet>
            <Text style={s.strong}>Automatic local snapshots</Text> — when enabled in Settings, the app waits for two quiet minutes on the Memories screen before checking for changes. Touches and navigation restart the wait; capture, import, restore, and export defer automatic work. It creates at most one verified automatic snapshot per local calendar day after records, tags, or settings change, keeping 7 daily, 4 weekly, and 3 monthly restore points entirely on this device. An unchanged-data check is silent; actual work uses a small non-blocking status banner.
          </Bullet>
          <Bullet>
            Snapshot media is stored in a content-addressed local vault with bounded streaming reads and checksum verification. A failed media read never creates a partial usable snapshot; video thumbnails are optional. Closing or backgrounding the app before the idle period ends defers the check until a later quiet foreground session. In Settings → Local Snapshot History, use <Text style={s.strong}>Create snapshot now</Text> to make a verified restore point without waiting, even if automatic snapshots are disabled. Local snapshots do not replace portable Complete backups.
          </Bullet>
          <Bullet>
            Open <Text style={s.strong}>Settings → Local Snapshot History</Text> to review counts and status, restore a verified point (matching IDs are replaced while unrelated records remain), or delete an older point. The newest verified point is protected.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Complete backup (Android)</Text> — creates one dated .mrbak archive containing records, tags, app settings, and every accessible photo, video, thumbnail, and voice memo. Media is processed in bounded chunks and every entry includes integrity data.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Complete restore (Android)</Text> — select a .mrbak archive. The app validates it, restores and verifies media in a staging directory, restores settings, and merges records without deleting unrelated records.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Complete-backup reminder</Text> — Settings recommends a new complete backup after 30 days or 25 distinct memory changes, whichever comes first. You can snooze the reminder for seven days. A restore triggers a fresh recommendation.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>Previous Expo Go data recovery (Android)</Text> — this option appears only in Expo Go. It scans older Expo Go storage areas on the same phone after an SDK or project change; the source data is not removed. A standalone APK cannot access those Expo Go folders.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>JSON export</Text> — tap Export in Settings. On Android a folder picker opens so you can save directly to Documents, Downloads, or Google Drive. On iPhone the share sheet appears with "Save to Files". The file is named <Text style={s.strong}>memory-records-backup-YYYY-MM-DD.json</Text> and is human-readable. Photo, video, and voice memo references are saved as local file paths, not embedded media data.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>JSON import</Text> — in the Import panel, tap <Text style={s.strong}>Pick JSON file</Text> to select a backup directly from your device, or paste the JSON text manually. Records are merged with existing ones — nothing is deleted. Duplicates are avoided by ID.
          </Bullet>
          <View style={{ height: 10 }} />
          <InfoBox>
            Use complete backups to protect recordings and other media. Keep JSON exports as an additional lightweight, human-readable safeguard. Secure AI keys and payment or unlock credentials are deliberately excluded from both formats.
          </InfoBox>
        </Section>

        <Section icon="shield" title="Privacy & security">
          <Bullet>
            <Text style={s.strong}>All data stays on your device.</Text> Records, photos, videos, voice memos, tags, and settings are stored in your phone's local document directory. Nothing is uploaded unless you explicitly use an AI feature or share/export data.
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
            <Text style={s.strong}>Optional app lock.</Text> Protect the app with device biometrics or a PIN fallback from Settings.
          </Bullet>
          <Bullet>
            <Text style={s.strong}>AI calls are direct.</Text> When the AI Interviewer is active, your messages go directly from your device to Mistral or OpenAI using your own key — no intermediary server reads them.
          </Bullet>
        </Section>

        <Section icon="book-open" title="License & source">
          <Bullet>
            <Text style={s.strong}>GPL-3.0-only.</Text> Memory Records is licensed under version 3 of the GNU General Public License only. If you distribute the app or a modified version, GPLv3 requires you to provide the corresponding source under its terms.
          </Bullet>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Read the GNU General Public License version 3"
            onPress={() => Linking.openURL(GPL_URL)}
            style={({ pressed }) => [s.licenseLink, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="file-text" size={18} color={colors.primary} />
            <Text style={s.licenseLinkText}>Read the full GPL v3 license</Text>
            <Feather name="external-link" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="View Memory Records source code on GitHub"
            onPress={() => Linking.openURL(GITHUB_URL)}
            style={({ pressed }) => [s.licenseLink, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Feather name="github" size={18} color={colors.foreground} />
            <Text style={s.licenseLinkText}>View the project source on GitHub</Text>
            <Feather name="external-link" size={16} color={colors.mutedForeground} />
          </Pressable>
          <Text style={s.footerNote}>
            Before sharing an APK, make sure the linked repository contains the source for that app version.
          </Text>
        </Section>

        <View style={s.divider} />

        {/* ── Support section ── */}
        <View style={{ marginBottom: 28 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: "#FFDD0020",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 16 }}>☕</Text>
            </View>
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground }}>
              Support this project
            </Text>
          </View>

          <Text
            style={{
              fontSize: 13,
              fontFamily: "Inter_400Regular",
              color: colors.mutedForeground,
              lineHeight: 20,
              marginBottom: 16,
            }}
          >
            Memory Records is free and open-source. If it saves you time or brings you joy, a small contribution helps keep it alive and growing.
          </Text>

          {/* Buy Me a Coffee */}
          <Pressable
            onPress={() => Linking.openURL(BMAC_URL)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              backgroundColor: pressed ? "#e6c700" : "#FFDD00",
              borderRadius: colors.radius,
              paddingVertical: 14,
              paddingHorizontal: 18,
              marginBottom: 10,
            })}
          >
            <Text style={{ fontSize: 22 }}>☕</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#1a1400" }}>
                Buy Me a Coffee
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#1a1400cc" }}>
                buymeacoffee.com/marcsebastien
              </Text>
            </View>
            <Feather name="external-link" size={16} color="#1a1400" />
          </Pressable>

          {/* PayPal */}
          <Pressable
            onPress={() => Linking.openURL(PAYPAL_URL)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              backgroundColor: pressed ? "#002070" : "#003087",
              borderRadius: colors.radius,
              paddingVertical: 14,
              paddingHorizontal: 18,
              marginBottom: 10,
            })}
          >
            <Text style={{ fontSize: 22 }}>💙</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: "#ffffff" }}>
                Donate via PayPal
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: "#ffffffaa" }}>
                One-time donation in EUR
              </Text>
            </View>
            <Feather name="external-link" size={16} color="#ffffff" />
          </Pressable>

          {/* GitHub */}
          <Pressable
            onPress={() => Linking.openURL(GITHUB_URL)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              backgroundColor: pressed ? colors.border : colors.surface,
              borderRadius: colors.radius,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 14,
              paddingHorizontal: 18,
            })}
          >
            <Feather name="github" size={22} color={colors.foreground} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                View on GitHub
              </Text>
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground }}>
                Marcseb/Memory-records
              </Text>
            </View>
            <Feather name="external-link" size={16} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <View style={s.divider} />

        <Text style={s.footerNote}>Memory Records{"\n"}Built with Expo · All data local · No tracking</Text>
      </ScrollView>
    </View>
  );
}
