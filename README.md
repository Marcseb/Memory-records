# Memory Records

Journal your memories with photos, voice, and text — then archive them to your Obsidian vault. No cloud, no account, no data ever leaves your phone.

---

## Quick Start

Three steps and you're up in under a minute.

---

### Step 1 — Get the app on your phone

Memory Records runs inside **Expo Go**, a free app available on both platforms.

| Platform | Install Expo Go |
|---|---|
| Android | [Google Play — Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent) |
| iOS | [App Store — Expo Go](https://apps.apple.com/app/expo-go/id982107779) |

Once Expo Go is installed, open Memory Records:

**On Android** — open Expo Go, tap **"Enter URL manually"** and type:
```
https://memory-vault-manager.replit.app
```

**On iOS** — open **Safari**, type that same address, and tap the prompt to open it in Expo Go.

The app loads in a few seconds. You can save it to your Expo Go home screen for quick access later.

---

### Step 2 — Create your account

Memory Records uses local authentication — your credentials are stored on your device only, never on a server.

1. On the Register screen, pick a username and password.
2. Tap **Create account**. That's it — you're in.

> Your login is tied to this device. If you reinstall the app, you will need to register again and restore from a JSON backup.

---

### Step 3 — Capture your first memory

Open the **Home** tab and tap **+**:

1. Pick a photo from your gallery — the app reads its EXIF data automatically (date, GPS, location name).
2. Add a text note, or tap the microphone to dictate hands-free.
3. Add tags to organise the memory, select an emotion tag, and optionally enter the Memory Year (the year the memory is from, if different from today).
4. Tap **Save**.

Your memory is stored locally, instantly, with no upload.

---

## Capturing memories

- **Photo from gallery** — EXIF metadata (date, GPS, location) is extracted automatically; no manual entry needed.
- **Clipboard paste** — paste a screenshot or image copied from another app. If no EXIF date is found, the app prompts you to enter one.
- **Text-only note** — write a note without any photo; useful for thoughts or conversations.
- **Voice-to-text** — dictate your note hands-free. Speech recognition runs on-device in French, Italian, or English.
- **Tags** — add one or more tags per memory to organise by theme, person, or place. Tags are manageable in Settings.
- **Emotion tags** — attach one of 22 colour-coded emotions (joy, nostalgia, gratitude, grief, etc.) to each memory. Used for grouping and filtering in the home list.
- **Memory Year** — optionally record the year the memory is from (e.g. 1998), independently of today's date. Used for chronological sorting.

---

## Sorting & browsing

The home list offers four sort modes, toggled with the pill bar at the top:

| Mode | Description |
|---|---|
| **Tag** | Grouped by primary tag (folder-style) |
| **Emotion** | Grouped by emotion, alphabetically |
| **Added** | Flat list, newest-added first |
| **Date** | Flat list, most recent Memory Year first |

Groups (Tag and Emotion modes) can be collapsed individually by tapping their header.

---

## AI Interviewer

An optional AI agent guides you through warm, open-ended questions to help you recall richer details — dates, emotions, people, sensory impressions.

Works with **Mistral** (recommended, free tier at [console.mistral.ai](https://console.mistral.ai)) or **OpenAI** as a fallback.

**Setup:**
1. Get a free API key at [console.mistral.ai](https://console.mistral.ai) (or from [platform.openai.com](https://platform.openai.com)).
2. In the app → Settings → AI Interviewer → paste your key.

**Using the interviewer:**
- On the New Memory screen, scroll to **AI Interviewer** and tap **Start interview**.
- The interviewer asks one focused question at a time. Type or dictate your answer in the Note field, then tap **Next question** to continue. Each answer is saved as a separate note.
- **Context notes (up to 3)** — before starting, tap **Add context** to pick up to 3 existing memories as background. The AI reads them to ask more connected, meaningful questions — referencing recurring people, places, or themes across your records.
- **Continuing from an existing record** — on any record's detail screen, tap **New note**. The app opens the new memory screen pre-seeded with that record's note and tags. You can add context notes, then tap **Start interview** to begin a session anchored to that memory.
- Select tags before starting to keep every question focused on a specific theme (family, travel, work, etc.).

> Your API key is stored in the device's secure enclave — the same mechanism used by banking apps. It is never sent to any server other than Mistral or OpenAI directly when you start an interview.

---

## Obsidian integration

Memory Records can save notes directly into your **Obsidian vault** as Markdown files — formatted, dated, and tagged — using the [Actions URI](https://obsidian-actions-uri.net) community plugin.

**Setup:**
1. In Obsidian → Settings → Community Plugins → Browse → search **"Actions URI"** → Install and Enable.
2. In the app → Settings → Obsidian Integration → enter your vault name and the target folder (default: `Memory Records`).
3. On any record's detail screen, tap **Save to Obsidian**.

> Both Obsidian and Memory Records must be installed on the same device. The app opens Obsidian via a deep link — no Wi-Fi or server needed.

Each saved note includes the date, memory year, tags, emotion, photo path, GPS coordinates, location name, and your full text, formatted in Markdown and fully searchable inside Obsidian.

---

## Backup & restore

- **JSON export** — tap Export in Settings. On **Android** a folder picker opens so you can save directly to Documents, Downloads, an SD card folder, or Google Drive. On **iOS** the share sheet appears with a "Save to Files" option. The file is named `memory-records-backup-YYYY-MM-DD.json` and contains all records and tags in a readable, pretty-printed format. Photo references are stored as local file paths (not embedded image data).
- **JSON import** — in the Import panel, either tap **Pick JSON file** to select a backup file directly from your device, or paste the JSON text manually. Records are merged with existing ones; duplicates are avoided by ID.
- **Import from Obsidian** — reimport previously saved Memory Records notes from your vault. On both Android and iOS, a file picker lets you navigate to your vault folder and select one or more `.md` files. Android users: in the picker, tap the **☰ menu → Internal storage**, then find `Obsidian → [vault] → Memory Records`.

> Regular JSON exports are the recommended backup strategy. If you reinstall the app or change device, a JSON backup lets you restore everything instantly.

---

## Support this project

Memory Records is free and open-source. If it saves you time or brings you joy, a contribution is always appreciated!

- ☕ [Buy me a coffee](https://buymeacoffee.com/marcsebastien)
- 💙 [Donate via PayPal](https://www.paypal.com/donate/?business=7AUYVWJE39NMQ&no_recurring=0&item_name=Building+open+source+apps+that+are+secure%2C+practical%2C+and+keep+your+data+local%E2%80%94not+in+the+cloud.&currency_code=EUR)

---
---

# Advanced

---

## Running locally

### Prerequisites
- [Expo Go](https://expo.dev/go) on your phone
- Node.js 24+ and pnpm

```bash
git clone https://github.com/Marcseb/Memory-records.git
cd Memory-records
pnpm install
pnpm --filter @workspace/memory-records run dev
```

Scan the QR code shown in the terminal with Expo Go.

---

## Privacy & security

- **All data stays on your device.** Records, photos, tags, and settings are stored as JSON files in your phone's local document directory (`FileSystem.documentDirectory`). Nothing is uploaded to any server.
- **Encrypted key storage.** AI API keys are stored using the device's secure enclave (expo-secure-store), the same mechanism used by banking apps. They are never written to plain storage.
- **Local authentication.** Your login credentials are stored locally on this device and are never sent to a remote server.
- **AI calls are direct.** When the AI Interviewer is active, your messages go directly from your device to Mistral or OpenAI using your own key — no intermediary server reads them.
- **No shared database.** Each installation is fully independent. One user cannot see another user's records.

---

## Architecture

| Layer | Technology |
|---|---|
| Mobile app | Expo SDK 54 / React Native |
| Routing | expo-router |
| Local storage | FileSystem.documentDirectory (expo-file-system/legacy) |
| Secure storage | expo-secure-store (device secure enclave) |
| AI | Mistral AI (primary) / OpenAI (fallback) |
| Obsidian | Actions URI deep link |
| Monorepo | pnpm workspaces + TypeScript |

```
artifacts/memory-records/   ← Expo app
  app/
    (auth)/                 ← Login & registration
    (tabs)/                 ← Home & Settings tabs
    new-record.tsx          ← New memory creation
    record/[id].tsx         ← Memory detail view
    help.tsx                ← Help & features guide
  components/               ← Shared UI components (EmotionPicker, RecordCard, …)
  constants/                ← Emotion definitions (22 emotions with colours)
  context/                  ← Auth, Records, Settings providers
  hooks/                    ← useInterview, useObsidian, useColors, …
  utils/                    ← obsidianParser, storage (FileSystem wrapper)
artifacts/api-server/       ← Express API server (TypeScript)
lib/                        ← Shared TypeScript libraries
```

---

## License

MIT — feel free to fork, adapt, and build on this.
