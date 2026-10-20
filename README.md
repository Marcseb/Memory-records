# Memory Records

Journal your memories with photos, voice memos, and text — then archive them to your Obsidian vault. No cloud account, no tracking, and no data leaves your phone unless you explicitly use an AI feature, export, or share it.

---

## Quick Start

Three steps to create your first memory. For the private Android APK, see the
[Android Studio build guide](artifacts/memory-records/ANDROID_BUILD.md).

---

### Step 1 — Get the app on your phone

Memory Records can be run in **Expo Go** for development. The standalone Android
production APK is built and signed locally; this project does not currently
publish an APK through Google Play.

For Expo Go development, install Expo Go, clone this repository, and start the
app from the workspace root:

```bash
pnpm install
pnpm --filter @workspace/memory-records exec expo start --go
```

Scan the terminal QR code with Expo Go. Expo Go and the standalone APK keep
separate local data; use a complete backup to move records and media between
them.

The Snapshot Test dev-client is a separate testing app and is not the production
APK.

---

### Step 2 — Create your account

Memory Records uses a local profile — your credentials are stored on your device only, never on a server.

1. On the Register screen, pick a username and password for your local profile.
2. Tap **Create account**. That's it — you're in.

> Your login is tied to this device. If you reinstall the app, you will need to register again and restore from a JSON backup.

---

### Step 3 — Capture your first memory

Open the **Home** tab and tap **+**:

1. Pick a photo from your gallery — the app reads available EXIF data such as the date and, when exposed by the device, GPS coordinates.
2. Add a text note, or tap the microphone to dictate hands-free.
3. If Premium is unlocked, optionally record a voice memo in the **Voice Memo** section below the note.
4. Add tags to organise the memory, select an emotion tag, and optionally enter the Memory Year (the year the memory is from, if different from today).
5. Tap **Save**.

Your memory is stored locally, instantly, with no upload.

---

## Capturing memories

- **Photo from gallery** — available EXIF metadata is extracted automatically, including the date and GPS coordinates when the device exposes them. If a date is unavailable, enter it manually. Tap the photo on the detail screen to view it full-screen. A camera overlay on any card lets you replace the photo at any time.
- **Video clip** — pick a short video from your gallery. The first frame is extracted as a thumbnail and shown on the card. Tap the thumbnail on the detail screen to play the video full-screen. Video clips are part of the free core features.
- **Clipboard paste** — paste a screenshot or image copied from another app. If no EXIF date is found, the app prompts you to enter one.
- **Text-only note** — write a note without any photo; useful for thoughts or conversations.
- **Voice-to-text** — dictate your note hands-free. Speech recognition runs on-device in French, Italian, or English.
- **Voice memos** *(Premium)* — unlock the premium feature pack to record an audio clip below the note, then play, pause, seek, replace, or delete it from the record. Voice memos are stored locally in the app. Records with audio show a speaker icon and receive the searchable `#voice-memo` tag automatically.
- **Tags** — add one or more tags per memory to organise by theme, person, or place. The new-record picker uses a compact horizontal chip row. Settings provides a collapsible tag section with compact chips and a control for creating new tags.
- **Emotion tags** — attach one of 22 colour-coded emotions (joy, nostalgia, gratitude, grief, etc.) to each memory. Used for grouping and filtering in the home list.
- **Memory Year** — optionally record the year the memory is from (e.g. 1998), independently of today's date. Used for chronological sorting.

On Android, if a selected photo has no readable GPS, the app may offer the
phone's current location as an alternative. This is optional and may not be
where the photo was taken. The Map view is temporarily disabled; saved GPS
coordinates remain attached to memories.

---

## Sorting & browsing

The home list offers four sort modes, toggled with the pill bar at the top:

| Mode | Description |
|---|---|
| **Folder** | Grouped by primary tag |
| **Emotion** | Grouped by emotion, alphabetically |
| **Added** | Flat list, newest-added first |
| **Date** | Flat list, most recent Memory Year first. Manual reordering within each year is supported. |

Groups (Tag and Emotion modes) can be collapsed individually by tapping their header.

- **Map** — temporarily disabled while an Android crash is investigated.
  Memories can still save GPS coordinates, and existing coordinates are kept.
- **Surprise Me** — open a random memory dated before today.

### Search

Use the search field at the top of the Home tab to filter memories by note text, tag, emotion, or location. Search results expand grouped sections automatically and show the matching count. Searching for `voice-memo` finds every record with a voice memo.

### Year rank reordering (Date mode)

In **Date** sort mode, each card shows its position within its year group as `N/M` (e.g. `2/5`). A reorder column appears on the right side of every card with three controls:

- **↑ / ↓** — move the note one step up or down within its year
- **🗑** — delete the note

The first time any note in a year is moved, all notes in that year are automatically assigned consecutive ranks based on their current display order. Ranks persist across restarts and are included in Obsidian exports (`**Year rank:** N`), so they survive a vault round-trip.

## Sharing a memory

On a record's detail screen, use **Share as image card** to create a card with
the record's photo when available, or its emotion artwork otherwise, along with
an excerpt of the note and its date. The card is shared through the phone's
system share sheet.

## App lock

An optional app lock is available in Settings. It uses the device's biometric
authentication when available and provides a PIN fallback.

---

## Unlocking Premium Features

The **AI Interviewer**, **Historical Events** generator, and **Voice Memos** are grouped into a single Premium feature pack, unlocked by a one-time **€10 contribution via PayPal**. Video clips and all other core features (capturing memories, sorting, search, tags, emotions, year ranks, Surprise Me, share cards, app lock, Obsidian export/import, and backups) remain free and require no payment. The Map view is temporarily disabled.

### How to unlock

1. Open **Settings → Premium Features** and tap **Unlock**, or tap the lock badge on the **Start interview** toggle, **Generate [year] events** button, or Voice Memo control.
2. The **Unlock Premium Features** sheet appears. It shows your **device ID** — a unique token tied to this installation.
3. Tap **Contribute €10 via PayPal**. A pre-filled PayPal form opens in your browser.
   — In the PayPal message / "special instructions" field, include your device ID so the payment can be matched automatically.
4. After payment, tap **I've paid — check payment status**. The app polls the server; if your payment has been processed, the AI Interviewer, Historical Events, and Voice Memos unlock immediately.
5. **Activation code (alternative):** If you prefer, send your device ID to the developer. Once your payment is confirmed, you'll receive a one-time code in the format `MR-XXXXXXXX`. Tap **I have an activation code**, enter it, and tap **Activate**.

The unlock is stored on the server and cached on-device for 12 hours. If you reinstall the app, re-enter your activation code or tap **Check payment status** to restore access.

> The €10 contribution is permanent for the device — no subscription, no recurring charges. Existing unlocks remain valid.

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

## Historical Events

On any record that has a **Memory Year** set, the detail screen shows a **"Generate [year] events"** button. Tap it to have the AI produce summaries of the most significant events from that year — worldwide and in your country — written in your chosen language.

**What gets generated:**

| Type | Scope |
|---|---|
| 🌐 **International** | Worldwide or global events |
| 🏛️ **National** | Events in the country of your voice-to-text language (French → France · Italian → Italy · English → United States) |

Each event is a ~10-sentence summary covering historical background, key actors, what happened, immediate consequences, and long-term significance.

**Visual distinction:**  
Historical event cards have a warm **amber background** and golden border that makes them instantly recognisable alongside personal notes. The thumbnail area shows a globe icon (international) or flag (national) instead of a camera.

**In the list:**  
Generated notes share the same `contextYear` as the source record, so they appear grouped next to it in Date sort mode and carry the `#historical` tag for organisation.

**Settings → Historical Events:**  
Two steppers (range 0 – 5) control how many events of each type are generated per trigger. Setting a type to 0 disables it entirely. Changes take effect immediately.

**Obsidian round-trip:**  
Each note exports with `**Event type:** International` (or `National`) in its Markdown. Re-importing the `.md` file restores the amber highlight and event scope automatically.

> Requires a Mistral or OpenAI API key configured in Settings → AI Interviewer.

---

## Obsidian integration

Memory Records can save notes directly into your **Obsidian vault** as Markdown files — formatted, dated, and tagged — using the [Actions URI](https://obsidian-actions-uri.net) community plugin.

**Setup:**
1. In Obsidian → Settings → Community Plugins → Browse → search **"Actions URI"** → Install and Enable.
2. In the app → Settings → Obsidian Integration → enter your vault name and the target folder (default: `Memory Records`).
3. On any record's detail screen, tap **Save to Obsidian**.

> Both Obsidian and Memory Records must be installed on the same device. The app opens Obsidian via a deep link — no Wi-Fi or server needed.

Each saved note includes the date, memory year, year rank, tags, emotion, event type (for historical notes), available photo path, GPS coordinates when present, location name, and your full text, formatted in Markdown and fully searchable inside Obsidian. Voice memo files remain in the app's local storage and are not embedded in the Markdown export.

### Bulk export

In **Settings → Obsidian Integration**, tap **Export all N notes to Obsidian** to export every note at once:

- **Android** — a folder picker opens; the app writes `.md` files directly into your vault via the Storage Access Framework. A live counter (`Writing 3 / 47…`) is shown during export.
- **iOS** — a ZIP archive is created and shared via the system share sheet. Save it to the Files app, then tap it to let iOS extract it automatically into your vault folder. A step-by-step extraction guide (using your actual vault name) is shown after sharing.

File names follow the format `YYYY-MM-DD[_tag][_year][_N].md` — the primary tag and memory year are embedded in the filename when present, making notes instantly browsable in Obsidian's file tree.

---

## Backup & restore

- **Local snapshots** — automatic, verified restore points stay on the device.
  Automatic checks wait for two quiet foreground minutes on the Memories screen
  and are deferred during capture, import, restore, and export. Checks with no
  changes are silent; actual work uses non-blocking progress. Settings shows
  history, restore/delete actions, and **Create snapshot now** for an immediate
  verified device-only restore point. Existing daily retention is unchanged.
- **Complete-backup reminder** — the app recommends a new complete backup
  after 30 days or 25 distinct memory changes, whichever comes first. The
  reminder can be snoozed for seven days and reappears after a restore.
- **Complete backup (Android)** — creates one dated `.mrbak` archive containing records, tags, app settings, and every accessible photo, video, thumbnail, and voice memo. Media streams in bounded chunks and each entry carries size and integrity data.
- **Complete restore (Android)** — select a `.mrbak` archive. The app strictly validates its manifest, restores and verifies media in a staging directory, then merges records without deleting unrelated records.
- **JSON export** — tap Export in Settings. On **Android** a folder picker opens so you can save directly to Documents, Downloads, an SD card folder, or Google Drive. On **iOS** the share sheet appears with a "Save to Files" option. The file is named `memory-records-backup-YYYY-MM-DD.json` and contains all records and tags in a readable, pretty-printed format. Photo, video, and voice memo references are stored as local file paths (not embedded media data).
- **JSON import** — in the Import panel, either tap **Pick JSON file** to select a backup file directly from your device, or paste the JSON text manually. Records are merged with existing ones; duplicates are avoided by ID.
- **Import from Obsidian** — reimport previously saved Memory Records notes from your vault. On both Android and iOS, a file picker lets you navigate to your vault folder and select one or more `.md` files. Android users: in the picker, tap the **☰ menu → Internal storage**, then find `Obsidian → [vault] → Memory Records`.

> Use complete backups when you need to protect recordings and other media. Keep JSON exports as an additional lightweight, human-readable safeguard. Secure AI keys and payment/unlock credentials are deliberately excluded from both backup formats.

**Previous Expo Go data recovery (Android)** is available only while running in
Expo Go. It can scan older Expo Go storage scopes on the same phone after an SDK
or project change. The standalone APK cannot access those Expo Go folders.

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
pnpm --filter @workspace/memory-records exec expo start --go
```

Scan the QR code shown in the terminal with Expo Go. For a signed Android
production APK, follow the [private APK build guide](artifacts/memory-records/ANDROID_BUILD.md).

---

## Privacy & security

- **All data stays on your device.** Records, photos, videos, voice memos, tags, and settings are stored in your phone's local document directory (`FileSystem.documentDirectory`). Nothing is uploaded to any server unless you explicitly use an AI feature or share/export data.
- **Optional app lock.** Protect access with device biometrics or a PIN fallback.
- **Encrypted key storage.** AI API keys are stored using the device's secure enclave (expo-secure-store), the same mechanism used by banking apps. They are never written to plain storage.
- **Local authentication.** Your login credentials are stored locally on this device and are never sent to a remote server.
- **AI calls are direct.** When the AI Interviewer or Historical Events generator is active, your requests go directly from your device to Mistral or OpenAI using your own key — no intermediary server reads them.
- **Unlock server.** The AI feature unlock is verified against a small server-side database (device token + payment record only). No personal data is stored — only the device token you present and the timestamp of verification.
- **No shared database.** Each installation is fully independent. One user cannot see another user's records.

---

## Architecture

| Layer | Technology |
|---|---|
| Mobile app | Expo SDK 57 / React Native |
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
  constants/                ← Emotion definitions, colour palette
  context/                  ← Auth, Records, Settings providers
  hooks/                    ← useInterview, useHistoricalEvents, useObsidian, useColors, …
  utils/                    ← obsidianParser, storage (FileSystem wrapper)
artifacts/api-server/       ← Express API server (TypeScript)
lib/                        ← Shared TypeScript libraries
```

---

## License

Copyright (C) 2026 Marcseb. Licensed under the GNU General Public License
v3.0 only. See [LICENSE](LICENSE).
