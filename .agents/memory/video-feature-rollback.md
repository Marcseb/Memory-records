---
name: Video feature rollback
description: History of the video picking feature attempt, why it crashed, and the safe plan for re-implementing it.
---

## What was implemented (then rolled back)
Three task agents added video attachment support:
- **Task #2** — thumbnail generation (`expo-video-thumbnails`), added `videoUri` and `videoThumbnailUri` fields to `MemoryRecord`.
- **Task #3** — video URI validity check (copy to document directory, detect stale URIs).

Also done in the same session (not by task agents):
- **Obsidian export redesign** — removed auto-export on save; added bulk "Export all N notes" button in Settings; filename changed to ISO date format (`YYYY-MM-DD`).

## Why it crashed
1. Task #3 imported `expo-file-system` (main entry) instead of `expo-file-system/legacy` in both `new-record.tsx` and `record/[id].tsx`. On `"newArchEnabled": true` (TurboModules), `requireNativeModule('FileSystem')` throws a hard native exception.
2. `expo-sharing@57.0.7` was already in the codebase (wrong version, expected `~14.0.8`). On iOS 26+, `isLiquidGlassAvailable()` = true triggers `NativeTabs`, which renders all tab screens eagerly at startup — including Settings which imports expo-sharing.
3. `expo-video` was at `~2.2.0` but SDK 54 expects `~3.0.16`.

## Rollback point
`81d5f16` — "feat: AI feature paywall — PayPal €5 unlock for AI Interviewer & Historical Events (v1.3)". This is the `origin/main` tip and was confirmed working in Expo Go.

## Safe implementation plan for next attempt
When re-implementing video picking:

1. **Upgrade expo-sharing first**: change `"expo-sharing": "^57.0.7"` → `"expo-sharing": "~14.0.8"` and run pnpm install. This is a ticking bomb regardless of video work.

2. **Use expo-file-system/legacy everywhere**: In new-record.tsx, record/[id].tsx, any new file that needs `documentDirectory` or `copyAsync` — import from `"expo-file-system/legacy"`, NOT `"expo-file-system"`.

3. **Upgrade expo-video to ~3.0.16** before adding any video code.

4. **Do NOT use expo-video-thumbnails with requireNativeModule** at module load time in eagerly-loaded screens.

5. **Test in Expo Go after each incremental change** — don't batch multiple native module changes.

6. After any task agent merge involving file/video work, grep for `"expo-file-system"` (without `/legacy`) and fix immediately.

## Features to re-implement (one at a time)
1. Obsidian export redesign (no native modules involved — safer to do first)
2. Video attachment (requires native module care as described above)
