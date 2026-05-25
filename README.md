# Memory Records

A personal memory journaling app built with Expo (React Native). Capture moments with photos, voice, or text — then save them to your Obsidian vault for long-term archiving.

**All data stays 100% on your device. No account required. No cloud sync. No tracking.**

---

## Try it now

Open this URL on your phone (requires [Expo Go](https://expo.dev/go)):

👉 **https://memory-vault-manager.replit.app**

Your browser will redirect straight into the app inside Expo Go.

---

## Features

### 📸 Capturing memories
- **Photo from gallery** — pick any photo and the app automatically reads its EXIF metadata: date taken, GPS coordinates, and location name
- **Clipboard paste** — paste a screenshot or image copied from another app; if no EXIF date is found, the app prompts you to enter one
- **Text-only note** — write a note without any photo
- **Voice-to-text** — tap the microphone to dictate your note hands-free (on-device, in French, Italian, or English)
- **Tags** — organise memories by theme, person, or place; tags are shared across all records

### 🤖 AI Interviewer
An optional AI agent guides you through warm, open-ended questions to help you recall richer details about a memory — dates, emotions, people, sensory impressions.

- Works with **Mistral** (recommended, free tier at [console.mistral.ai](https://console.mistral.ai)) or **OpenAI** as a fallback
- Your API key is stored **encrypted on your device only** — never sent to any server other than Mistral or OpenAI directly

### 📚 Obsidian integration
Memory Records can save notes directly into your **Obsidian vault** as Markdown files — formatted, dated, and tagged — using the [Actions URI](https://obsidian-actions-uri.net) community plugin.

- Each note includes the date, year, tags, GPS coordinates, location name, and your full text
- Notes are formatted in Markdown and fully searchable inside Obsidian
- Both apps must be installed on the same device

### 💾 Backup & restore
- **JSON export** — share a complete backup of all records and tags as a JSON file
- **JSON import** — merge a backup into the app; duplicates are avoided by ID
- **Import from Obsidian** — reimport previously saved Markdown notes back into the app

### 🔒 Privacy & security
- All data stored in your phone's local storage (AsyncStorage)
- AI API keys stored in the device's secure enclave (same mechanism used by banking apps)
- Local authentication — credentials never sent to a remote server
- AI calls go directly from your device to Mistral/OpenAI — no intermediary server

---

## Setup

### Prerequisites
- [Expo Go](https://expo.dev/go) installed on your phone (iOS or Android)
- Node.js 24+ and pnpm

### Run locally
```bash
git clone https://github.com/Marcseb/Memory-records.git
cd Memory-records
pnpm install
pnpm --filter @workspace/memory-records run dev
```

Then scan the QR code with Expo Go.

### Obsidian integration setup
1. In Obsidian → Settings → Community Plugins → Browse → search **"Actions URI"** → Install and Enable
2. In the app → Settings → Obsidian Integration → enter your vault name and target folder

### AI Interviewer setup
1. Get a free API key at [console.mistral.ai](https://console.mistral.ai) (or use OpenAI)
2. In the app → Settings → AI Interviewer → paste your key

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile app | Expo SDK 54 / React Native |
| Routing | expo-router |
| Storage | AsyncStorage + expo-secure-store |
| AI | Mistral AI (primary) / OpenAI (fallback) |
| Obsidian | Actions URI deep link |
| Monorepo | pnpm workspaces + TypeScript |

---

## Project structure

```
artifacts/memory-records/   ← Expo app
  app/                      ← Screens (expo-router)
    (auth)/                 ← Login & registration
    (tabs)/                 ← Home & Settings tabs
    new-record.tsx          ← New memory creation
    record/[id].tsx         ← Memory detail view
    help.tsx                ← Help & features guide
  components/               ← Shared UI components
  context/                  ← Auth, Records, Settings providers
  hooks/                    ← useInterview, useColors, ...
artifacts/api-server/       ← Express API server (TypeScript)
lib/                        ← Shared TypeScript libraries
```

---

## Support this project

Memory Records is free and open-source. If it saves you time or brings you joy, a small contribution helps keep it alive and growing.

☕ [Buy Me a Coffee](https://buymeacoffee.com/marcsebastien)

💙 [Donate via PayPal](https://www.paypal.com/donate/?business=7AUYVWJE39NMQ&no_recurring=0&item_name=Building+open+source+apps+that+are+secure%2C+practical%2C+and+keep+your+data+local%E2%80%94not+in+the+cloud.&currency_code=EUR)

---

## License

MIT — feel free to fork, adapt, and build on this.
