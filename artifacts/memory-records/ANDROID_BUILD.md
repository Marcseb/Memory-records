# Private production APK: repeatable updates

Replit holds the source. Ubuntu/Android Studio builds and signs the APK.
The installed app does not update automatically when you edit Replit.

## Each release

1. Make and test the changes in Replit.
2. In this app's `app.json`, update `expo.version` and increase
   `expo.android.versionCode` above the version installed on the phone.
   The first release used version `1.0.0`, code `1`; the next can use
   `1.0.1`, code `2`. Keep the Android package `app.memoryrecords`.
   Preparation validates these values but never increments them automatically.
3. Export a verified complete backup from the phone.
4. Download the updated **whole Replit workspace ZIP**, not just this app
   directory. Extract to a new Ubuntu folder and keep your previous working copy.
5. Open a Terminal at the extracted workspace root (where `pnpm-lock.yaml` is)
   and run:

   ```sh
   pnpm install --frozen-lockfile
   pnpm run android:prepare
   ```

6. Open `artifacts/memory-records/android` in Android Studio. Use installed
   **JDK 17**, sync, and choose **Generate Signed App Bundle or APK → APK**.
   Use your **existing keystore**, its existing alias/passwords, and **release**.
   Confirm the app ID is `app.memoryrecords`.
7. Find the signed APK in `android/app/release` or
   `android/app/build/outputs/apk/release`. Install over the existing app,
   without uninstalling. Check the changed features and existing records/media.

## What is now automatic

- The compatible Babel preset is a direct app dependency.
- Expo, React and React Native are declared once, under dependencies, so
  prebuild does not need to add duplicate entries.
- The committed lockfile accompanies those changes.
- The guide records the pnpm version used in the successful local build,
  without changing Replit's managed package manager.
- `android:prepare` explicitly forces production mode even when the parent
  terminal or a downloaded `.env` selects Snapshot Test.
- The native-build plugin recreates local-only JDK 17 daemon criteria and
  disables `updateDaemonJvm` download-link generation on every prebuild.
- Preparation verifies the generated production package and version numbers.

No manual Babel installation or Gradle block editing is needed anymore.
The normal Snapshot Test development command and storage identity are unchanged.
Preparation regenerates the Android folder so it matches current source.
Before regeneration, any existing native source/configuration is copied into
`.android-prebuild-backups` (large build caches are excluded). Keep the old
working project separately as well. Private keystores inside `android` block
preparation: move them outside the project first.
The command does not create a signing key, modify memory/backup data, or
build/sign an APK.

## One-time Ubuntu requirements

Keep the working Node installation, Android SDK/NDK/CMake, and JDK 17.
The Node executable must be visible to Android Studio's Gradle process, not
only to its Terminal. The working Node link you already made can remain;
if that nvm Node version is removed, update the link accordingly.

For Ubuntu, keep the tested pnpm version. If Corepack reports a different
version, activate it once:

```sh
corepack install --global pnpm@11.28.5
pnpm --version
```

Keep the signing keystore **outside** the project and backed up securely.
Never upload it or its passwords to Replit/Git. Loss of the signing key prevents
ordinary updates over your existing private installation.

## Checks and troubleshooting

`pnpm run android:check` checks the production configuration without prebuild.

Do not routinely upgrade AGP, Gradle, or Expo just because Android Studio
recommends it. Those upgrades are separate changes requiring validation.

If frozen installation fails, stop and resolve the manifest/lockfile mismatch
in the source before distributing another ZIP. Do not delete the lockfile.

If preparation says prebuild failed, do not proceed to signing.
For a bundling failure, run this from the native `android` folder:

```sh
./gradlew :app:createBundleReleaseJsAndAssets --info --stacktrace > release-bundle-log.txt 2>&1
```

The log captures bundle-generation diagnostics, not the signing credentials.
