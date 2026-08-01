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

## expo-media-library: must use SDK-54-compatible version ~18.2.1
- Install with `npx expo install expo-media-library` (NOT `pnpm add`) to get the correct peer-compatible version.
- `pnpm add expo-media-library` installs `57.0.3` which uses `ExpoMediaLibraryNext` — NOT bundled in Expo Go SDK 54 → hard crash even with dynamic import.
- Version `~18.2.1` uses `requireNativeModule('ExpoMediaLibrary')` which IS in Expo Go SDK 54.
- Use dynamic import: `const ML = await import("expo-media-library")` inside try/catch.
- **Always pass `granularPermissions: ["photo", "video"]`** to `requestPermissionsAsync` — Expo Go's AndroidManifest does not declare AUDIO, so the default call (which includes audio) throws: "You have requested the AUDIO permission, but it is not declared in AndroidManifest."
- `creationTime` may be seconds or ms; normalise with: `info.creationTime > 1e11 ? info.creationTime : info.creationTime * 1000`.
- On Android Expo Go, `asset.fileName` from ImagePicker is the MediaStore row ID (e.g. `1000048304.mp4`), not the original filename. Strip the extension and pass the numeric string to `getAssetInfoAsync`.
