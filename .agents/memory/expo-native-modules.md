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

## Known safe imports
- `expo-file-system/legacy` ✅
- `expo-video@~3.0.16` ✅ (SDK 54)
- `expo-video-thumbnails@~10.0.8` ✅
- `expo-sharing@~14.0.8` ✅
