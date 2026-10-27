# Free Android production build and Google Play preparation

This guide applies only to `google-play-free`.

- App: Memory Records Free
- Package: `app.memoryrecords.free` — keep this fixed after release
- Source version: `1.0.8`, initial Android version code `1`
- Snapshot Test and all Pro activation paths: disabled

## Prepare

1. Use a separate checkout of `google-play-free`; keep the private/full app's
   checkout unchanged. Read the root `BRANCH_MANAGEMENT.md`.
2. Use Node.js 24, pnpm 11.28.5, Android Studio, local JDK 17, and the SDK/NDK/CMake
   versions requested by the generated Android project.
3. From the workspace root:

   ```sh
   pnpm install --frozen-lockfile
   pnpm run android:check
   pnpm run android:prepare
   ```

4. Open `artifacts/memory-records/android` in Android Studio. Confirm the package
   is **app.memoryrecords.free**, version code is correct, and the Release
   variant is selected.

`android:prepare` regenerates native files and backs up existing native source.
Keep private signing files outside the project. No Google Maps key is required
while the Map screen is disabled.

## Device testing

Generate a signed **release APK** for local tests. Install it alongside, not
over, the private `app.memoryrecords` app. Verify core capture, photo/video
playback, app lock, snapshots, Complete backup/restore, and JSON import/export.
Confirm there are no Pro, Obsidian, payment, donation, or support-checkout entry
points, including after restoring a full-edition backup.

An app preview is not a substitute for testing the actual native release APK.

## Google Play artifact

Use **Build → Generate Signed App Bundle or APK → Android App Bundle** to
produce the signed release **AAB**. Preserve the upload key and follow Play App
Signing setup. An APK is useful for private testing; the AAB is the intended
Play upload artifact. No binary is signed or published by these source changes.

The first Play upload must use a unique package and signing setup in your
developer account. Later updates must retain that identity and increase
`expo.android.versionCode`. Update the visible version when appropriate.

## Before public release

- Review current target API, native library/16 KB page-size compatibility, and
  Play Console developer-account/testing requirements for this actual AAB.
- Prepare accurate store text/screenshots, privacy policy, Data safety, content
  rating, and permissions declarations.
- Upload to an internal/closed track and test native behavior before production.
- Verify that the in-app source link points to the corresponding free-branch
  source revision and preserve GPL notices.
- Do not add external payment/Pro purchase links without a separate policy and
  billing review.

The existing Linux-oriented workspace lockfile is intended for the documented
Android build environment. Do not assume it is suitable for macOS; Mac source
packages require a separately matched Darwin-compatible lockfile.
