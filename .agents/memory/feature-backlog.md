---
name: Feature backlog
description: Scoped feature ideas for Memory Records app, numbered 1–8. User will request them by number in future sessions.
---

Each item below is ready to implement. The user will say "implement feature #N" to activate one.

---

## #1 — On This Day
**Summary**: Each morning a local push notification surfaces a memory from the same calendar date in a previous year.

**Done looks like**:
- `expo-notifications` schedules a daily local notification at a configurable time (default 9 AM)
- Query `RecordsContext` for records whose date matches today's MM-DD in any past year
- Notification body: record snippet + "X years ago"
- If no match exists, no notification sent that day
- Settings screen: toggle "On This Day reminders" + time picker
- Tapping the notification deep-links to the matching record

**Key files**: `app/_layout.tsx`, new `utils/onThisDay.ts`, `app/(tabs)/settings.tsx`
**Notes**: `expo-notifications` local notifications work in Expo Go on Android; iOS needs a physical device. No server required.

---

## #2 — Search
**Summary**: Real-time filter on the record list by keyword (note text), tag, or emotion.

**Done looks like**:
- Search bar at the top of the main record list screen
- Filters client-side in real time; clearing restores full list
- Empty-state message when nothing matches
- Bar scrolls away naturally when not in use

**Key files**: `app/(tabs)/index.tsx` (add search state + filtered list)
**Notes**: No new packages needed.

---

## #3 — Voice memo
**Summary**: Microphone button on new-record and record-detail screens to capture a short audio clip that plays back inline.

**Done looks like**:
- Tap to start recording, tap again to stop; timer shows while recording
- Clip saved to document directory alongside the record
- Playback inline with play/pause + progress bar
- One clip per record; replacing prompts for confirmation
- Clip included in Obsidian export as an attachment
- `audioUri` field added to `MemoryRecord` type

**Key files**: `app/new-record.tsx`, `app/record/[id].tsx`, `utils/storage.ts`, `types/MemoryRecord.ts`
**Package**: `expo-av` (already installed via expo-video)

---

## #4 — Share as card
**Summary**: Share button on a record generates a clean image card (emotion/photo + text + date) via the system share sheet.

**Done looks like**:
- Share icon in the record detail header
- Off-screen card rendered and captured with `react-native-view-shot`
- Card: app brand colours, photo or emotion icon, first ~100 chars of note, date
- Passed to `expo-sharing` / Share API; temp file cleaned up after

**Key files**: `app/record/[id].tsx`, new `components/ShareCard.tsx`, new `utils/shareCard.ts`
**Packages**: `react-native-view-shot`, `expo-sharing` (likely already present)

---

## #5 — Map view
**Summary**: A map tab showing all geotagged records as pins; tap a pin to open the record.

**Done looks like**:
- New "Map" tab in the bottom tab bar
- `react-native-maps` MapView with one marker per record that has lat/lng
- Markers use emotion colour; callout shows title + date; tapping navigates to record detail
- Records without GPS silently excluded
- Map centres on most recent geotagged record on first load

**Key files**: new `app/(tabs)/map.tsx`, `app/(tabs)/_layout.tsx`, `context/RecordsContext.tsx`
**Package**: `react-native-maps` (works in Expo Go on Android with Google Maps; iOS needs API key for production)

---

## #6 — Recording streak
**Summary**: A 🔥 consecutive-days counter on the home screen that resets if the user skips a day.

**Done looks like**:
- Streak = count of consecutive calendar days (ending today or yesterday) with at least one record
- Small chip/badge in the main record list header
- Hidden or "Start your streak!" if streak < 2
- Optional: milestone notifications at 7, 30, 100 days via `expo-notifications`

**Key files**: new `utils/streak.ts` (pure function), `app/(tabs)/index.tsx`
**Notes**: No new packages needed.

---

## #7 — PIN / biometric lock
**Summary**: Optional Face ID / fingerprint (or 4-digit PIN fallback) lock on app open.

**Done looks like**:
- Settings toggle "Lock app on open" (off by default)
- Lock screen shown on open or return from background after >30 s
- Biometric via `expo-local-authentication`; falls back to PIN if unavailable
- PIN stored in `expo-secure-store` (already installed)
- "Change PIN" option in Settings

**Key files**: `app/_layout.tsx` (overlay on app state change), new `components/LockScreen.tsx`, new `utils/auth.ts`, `app/(tabs)/settings.tsx`
**Package**: `expo-local-authentication` (works in Expo Go on physical devices)

---

## #8 — Random memory ("Surprise me")
**Summary**: A button that opens a random past record instantly.

**Done looks like**:
- Shuffle icon in the main record list header
- Picks a random record from `RecordsContext` (excluding today's) and navigates to its detail
- Hidden or shows "Add more memories first" if fewer than 2 records exist
- Optional subtle animation on tap

**Key files**: `app/(tabs)/index.tsx`
**Notes**: No new packages needed — simplest feature on the list.
