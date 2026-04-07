# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains an Express API server and an Expo mobile app ("Memory Records").

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### Memory Records (Mobile App)
- **Path**: `artifacts/memory-records/`
- **Type**: Expo (React Native)
- **Preview**: `/memory-records/`
- **Purpose**: A personal memory journaling app — users select photos from their gallery or paste from clipboard, add text or voice notes, and save the records to an Obsidian vault via the Actions URI plugin.

**Key features:**
- Custom username/password authentication (stored locally with AsyncStorage + SecureStore)
- Photo selection from gallery (with EXIF/GPS metadata extraction)
- Clipboard paste for images (when no metadata, user is prompted to enter date)
- Text annotation + voice-to-text (on-device, native)
- Obsidian Actions URI integration (saves notes to obsidian vault via deep link)
- AsyncStorage persistence for all records and settings
- Dark/light mode support

**Screens:**
- `(auth)/login.tsx` — Sign-in screen
- `(auth)/register.tsx` — Registration screen
- `(tabs)/index.tsx` — Main memory list
- `(tabs)/settings.tsx` — Obsidian vault settings + account
- `new-record.tsx` — New memory creation (photo + note)
- `record/[id].tsx` — Memory detail view + Obsidian save button

**Context providers:**
- `context/AuthContext.tsx` — User session management
- `context/SettingsContext.tsx` — Obsidian vault name/folder
- `context/RecordsContext.tsx` — Memory records CRUD

**Obsidian integration:**
- Uses `obsidian://actions-uri/note/create` deep link
- Requires Actions URI plugin installed in Obsidian on the same device
- Vault name + folder configurable in Settings tab

### API Server
- **Path**: `artifacts/api-server/`
- **Type**: Express 5 + TypeScript
- **Preview**: `/api`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
