---
name: Expo Go native module rules
description: Which expo packages crash Expo Go at startup vs which are safe, and the key patterns to follow when adding native-module-dependent features.
---

## Rule 1 — expo-file-system: always use /legacy in Expo Go
`expo-file-system` has two entry points:
- **Main** (`expo-file-system`): calls `requireNativeModule('FileSystem')` — **hard crash** if the native module isn't in the running Expo Go version.
- **Legacy** (`expo-file-system/legacy`): calls `requireOptionalNativeModule('ExponentFileSystem')` — safe, graceful fallback.

Expo Go SDK 54 ships the legacy native module. Always import from `expo-file-system/legacy` in this project.
`documentDirectory`, `copyAsync`, `getInfoAsync`, `StorageAccessFramework` are all available in the legacy path.

**Why:** `requireNativeModule` throws a hard native exception in TurboModules (New Architecture) — it crashes the whole process before any UI appears, with no JS error overlay.

**How to apply:** Any time a task agent or code adds `import * as FileSystem from "expo-file-system"`, change it to `"expo-file-system/legacy"`.

## Rule 2 — Keep expo-video at the SDK-expected version
Expo Go bundles a specific version of every native module. The JS package version must match exactly.
- SDK 54 expects `expo-video@~3.0.16`. Using `~2.2.0` causes a native module name/API mismatch.
- `expo-video`'s `NativeVideoModule` uses `requireNativeModule('ExpoVideo')` — also a hard crash if wrong.

## Rule 3 — expo-sharing must match SDK expectations
`expo-sharing@57.0.7` was installed (badly wrong — expected `~14.0.8` for SDK 54). Since the app uses `isLiquidGlassAvailable()` (true on iOS 26+) which switches to `NativeTabs` that renders ALL tab screens eagerly, the Settings tab loading expo-sharing at startup caused a hard crash. Always keep expo-sharing at `~14.0.8`.

## Rule 4 — Task agents often import `expo-file-system` (main) instead of `/legacy`
Any task related to file copying, video URIs, or document directory should be reviewed post-merge for this import.

## Rule 5 — Reanimated 4 requires the worklets Babel plugin explicitly
`babel-preset-expo` does NOT automatically include the worklets transform. Without it, every animated component throws `[Worklets] Failed to create a worklet` at runtime — no red overlay, just an uncaught error.

Add to `babel.config.js`:
```js
plugins: ["react-native-worklets/plugin"]
```

This must be present whenever `react-native-reanimated` (v4+) is used. The plugin lives at `react-native-worklets/plugin/index.js`. Clearing Metro cache without this plugin in place will re-surface the crash on the next fresh bundle.

**Why:** In Reanimated 4, worklet transformation moved from `react-native-reanimated/plugin` (v3) to `react-native-worklets/plugin`. `babel-preset-expo` doesn't include either automatically.

## Rule 7 — Android Expo Go ImagePicker caches videos with MediaStore ID as filename
On Android, `ImagePicker.launchImageLibraryAsync` for videos returns:
- `assetId`: **null** (not populated on Android)
- `uri`: a `file://` path inside Expo Go's ImagePicker cache, NOT a `content://` URI
- `fileName`: the MediaStore numeric ID + extension, e.g. `1000048306.mp4`

To get `creationTime` from `expo-media-library` on Android: strip the extension from `fileName`, verify it's all digits, and pass that string to `getAssetInfoAsync(id)`.

**Why:** Expo Go copies the picked video to its own cache before returning — the original content:// URI is not exposed. The cache filename is always `<mediaStoreId>.<ext>`.

**How to apply:** Any code reading video metadata on Android must use the numeric filename stem as the asset reference, not the URI or assetId.

## Rule 6 — expo-media-library must be dynamically imported
`expo-media-library` main entry calls `requireNativeModule('ExpoMediaLibrary')` — same hard-crash risk as `expo-file-system` main.
Use `await import("expo-media-library")` inside a try/catch, never a static top-level import.
`getAssetInfoAsync(assetId)` returns `creationTime` in **seconds** since epoch; multiply by 1000 for `new Date()`.
The `assetId` field on an `ImagePickerAsset` is the correct input to pass.

**Why:** Static import executes at module load time, crashing the process before any UI renders.

**How to apply:** Any task that needs media library metadata should use dynamic import gated in try/catch, same pattern as `expo-video-thumbnails`.

## Known safe imports
- `expo-file-system/legacy` ✅
- `expo-video@~3.0.16` ✅ (SDK 54)
- `expo-video-thumbnails@~10.0.8` ✅
- `expo-sharing@~14.0.8` ✅

## expo-media-library in Expo Go (Android) — effectively unusable for reading video metadata

Getting the recording date from a video selected via ImagePicker is **not reliably achievable in Expo Go on Android**. Every path has been exhausted:

| Attempt | Result |
|---|---|
| `expo-media-library@57.0.3` (pnpm add) | Crashes at startup — `ExpoMediaLibraryNext` not in Expo Go SDK 54; Metro runs module init synchronously, escapes try/catch |
| `expo-media-library@~18.2.1` (npx expo install) | Module loads (`ExpoMediaLibrary`), but `requestPermissionsAsync()` throws — AUDIO permission not declared in Expo Go AndroidManifest |
| `requestPermissionsAsync(false, ["photo","video"])` | No crash, but `getAssetInfoAsync` silently fails (permission still denied or asset lookup returns nothing) |
| Filename parsing (`VID-20200808-WA0003.mp4`) | Expo Go Android renames the cached file to the MediaStore row ID (`1000048304.mp4`), discarding the original name |

**Root cause**: Expo Go's AndroidManifest is fixed — you cannot add permissions or config plugins to it. `expo-media-library` needs manifest entries we cannot provide.

**The only real fix**: build a custom dev client with EAS (`eas build --profile development`) so you control the manifest. In Expo Go, fall back to manual date entry (current behaviour).

**Current code state**: `expo-media-library` has been fully removed from the project. `handleVideoPick` uses only filename parsing as a fallback, then manual date input. No crash, graceful degradation.

**Why removed**: Even as a lazy dynamic import, the package adds a 4.27MB sub-bundle chunk to Metro's dependency graph (1763 modules vs ~1509 without it). This pushed the Android bundle load time from ~9.5s to ~15.5s, hitting Expo Go's loading timeout and causing "Something went wrong" at startup. Since the package cannot provide recording dates in Expo Go regardless, keeping it was all downside.
