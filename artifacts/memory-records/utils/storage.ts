/**
 * Persistent JSON storage backed by FileSystem.documentDirectory.
 *
 * Why not AsyncStorage alone?
 * In Expo Go, AsyncStorage and documentDirectory are scoped to the experience
 * identity. Files are more suitable for records and media, but an SDK/project
 * identity change can still make an older scope invisible. The Settings
 * recovery tool can scan sibling Expo Go experience folders when Android keeps
 * the old files.
 *
 * Migration: on first read, if no file exists we fall back to AsyncStorage
 * and, if found, write the data to the file so future reads bypass AsyncStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";

const DIR = FileSystem.documentDirectory ?? "";

function filePath(filename: string): string {
  return DIR + filename;
}

export async function readJsonFile<T>(
  filename: string,
  legacyAsyncKey?: string
): Promise<T | null> {
  const path = filePath(filename);
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const raw = await FileSystem.readAsStringAsync(path);
      return JSON.parse(raw) as T;
    }
  } catch {
    // fall through to legacy migration
  }

  if (legacyAsyncKey) {
    try {
      const raw = await AsyncStorage.getItem(legacyAsyncKey);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        await writeJsonFile(filename, parsed);
        return parsed;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export async function writeJsonFile<T>(filename: string, data: T): Promise<void> {
  const path = filePath(filename);
  const target = new File(path);
  const temporaryPath = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const temporary = new File(temporaryPath);
  let moved = false;
  try {
    const payload = JSON.stringify(data);
    temporary.create({ overwrite: false, intermediates: true });
    temporary.write(payload);
    JSON.parse(await temporary.text());
    await temporary.move(target, { overwrite: true });
    moved = true;
  } finally {
    // File.move mutates `temporary.uri` to the destination after success.
    // Only clean the original temp path when the move did not commit.
    if (!moved) {
      const leftover = new File(temporaryPath);
      if (leftover.exists) leftover.delete();
    }
  }
}

export async function deleteJsonFile(filename: string): Promise<void> {
  const path = filePath(filename);
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      await FileSystem.deleteAsync(path);
    }
  } catch {
    // ignore
  }
}

/**
 * Copy a video picked from the gallery into the app's persistent video folder
 * (documentDirectory/videos/) so it survives app updates and device backups.
 *
 * iOS backup behaviour
 * --------------------
 * Files in documentDirectory are included in iCloud backups by default.
 * We deliberately keep videos here (not in cacheDirectory or tmp) so they
 * survive a backup → restore cycle on iOS without any extra configuration.
 * The dedicated `videos/` sub-folder makes storage auditing straightforward
 * (see Task #16: show storage usage).
 *
 * @param fromUri  The temporary URI returned by expo-image-picker / the gallery.
 * @param ext      File extension without leading dot (e.g. "mp4", "mov").
 * @returns        The permanent URI inside documentDirectory/videos/.
 */
export async function copyVideoToAppStorage(fromUri: string, ext: string): Promise<string> {
  if (!DIR) {
    throw new Error("documentDirectory is not available on this platform.");
  }

  // Ensure the dedicated videos folder exists.
  const videosDir = `${DIR}videos/`;
  const dirInfo = await FileSystem.getInfoAsync(videosDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(videosDir, { intermediates: true });
  }

  const destUri = `${videosDir}video_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: fromUri, to: destUri });

  // documentDirectory on iOS is backed up by iCloud by default.
  // No NSURLIsExcludedFromBackupKey manipulation is needed; the system
  // includes these files automatically as long as they stay under
  // documentDirectory (not cacheDirectory or tmp).

  return destUri;
}

/** Copy a selected photo into app-owned document storage. */
export async function copyImageToAppStorage(
  fromUri: string,
  extension = "jpg",
): Promise<string> {
  if (!DIR) {
    throw new Error("documentDirectory is not available on this platform.");
  }

  const imagesDir = `${DIR}images/`;
  await FileSystem.makeDirectoryAsync(imagesDir, { intermediates: true });
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  const destinationUri =
    `${imagesDir}image_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExtension}`;
  await FileSystem.copyAsync({ from: fromUri, to: destinationUri });
  return destinationUri;
}

/** Copy a generated video thumbnail out of temporary storage. */
export async function copyThumbnailToAppStorage(
  fromUri: string,
  destinationDirectory?: string,
): Promise<string> {
  if (!DIR) {
    throw new Error("documentDirectory is not available on this platform.");
  }

  const thumbnailsDir = destinationDirectory ?? `${DIR}thumbnails/`;
  const dirInfo = await FileSystem.getInfoAsync(thumbnailsDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(thumbnailsDir, { intermediates: true });
  }

  const separator = thumbnailsDir.endsWith("/") ? "" : "/";
  const destUri = `${thumbnailsDir}${separator}video_thumbnail_${Date.now()}.jpg`;
  // SDK 57's Android copyAsync can mis-handle temporary/content URIs.
  // Thumbnails are small, so a bounded base64 read/write is more reliable
  // than retaining or copying the generator's temporary URI.
  const base64 = await FileSystem.readAsStringAsync(fromUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.writeAsStringAsync(destUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return destUri;
}

/**
 * Calculate total size of all video files the app has copied into its storage.
 *
 * Scans two locations:
 *  - documentDirectory/videos/  (current layout — copyVideoToAppStorage target)
 *  - documentDirectory/video_*  (legacy flat layout from older app versions)
 *
 * Returns the aggregate size in bytes and the number of files found.
 * Safe to call at any time; errors on individual files are ignored.
 */
export async function getVideoStorageSize(): Promise<{ bytes: number; fileCount: number }> {
  if (!DIR) return { bytes: 0, fileCount: 0 };

  let bytes = 0;
  let fileCount = 0;

  // ── current layout: documentDirectory/videos/ ──
  const videosDir = `${DIR}videos/`;
  try {
    const dirInfo = await FileSystem.getInfoAsync(videosDir);
    if (dirInfo.exists) {
      const files = await FileSystem.readDirectoryAsync(videosDir);
      for (const name of files) {
        try {
          const info = await FileSystem.getInfoAsync(`${videosDir}${name}`);
          if (info.exists && "size" in info && typeof info.size === "number") {
            bytes += info.size;
            fileCount++;
          }
        } catch {
          // ignore individual file errors
        }
      }
    }
  } catch {
    // videos/ folder doesn't exist yet — that's fine
  }

  // ── legacy layout: flat video_* files in documentDirectory ──
  try {
    const rootFiles = await FileSystem.readDirectoryAsync(DIR);
    for (const name of rootFiles) {
      if (!name.startsWith("video_")) continue;
      try {
        const info = await FileSystem.getInfoAsync(`${DIR}${name}`);
        if (info.exists && "size" in info && typeof info.size === "number") {
          bytes += info.size;
          fileCount++;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return { bytes, fileCount };
}

/**
 * Format a byte count as a human-readable string (e.g. "12.3 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Copy an audio recording into the app's permanent audio directory.
 * Returns the new URI inside documentDirectory/audio/.
 */
export async function copyAudioToAppStorage(fromUri: string, ext: string): Promise<string> {
  if (!DIR) {
    throw new Error("documentDirectory is not available on this platform.");
  }
  const audioDir = `${DIR}audio/`;
  const dirInfo = await FileSystem.getInfoAsync(audioDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true });
  }
  const destUri = `${audioDir}audio_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: fromUri, to: destUri });
  return destUri;
}

/**
 * Delete an audio file the app copied into documentDirectory.
 * Safe to call with undefined or URIs outside the app directory.
 */
export async function deleteAppAudio(uri: string | undefined): Promise<void> {
  if (!uri || !DIR || !uri.startsWith(DIR)) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri);
  } catch {
    // ignore — file may already be gone
  }
}

/**
 * Delete a video (or any media) file that the app copied into documentDirectory.
 * Silently does nothing if the URI is undefined, empty, or not inside the app's
 * document directory — so it is safe to call on any stored videoUri without
 * worrying about accidentally removing gallery originals.
 *
 * Handles both the legacy flat layout (documentDirectory/video_*.ext) and the
 * current sub-folder layout (documentDirectory/videos/video_*.ext).
 */
export async function deleteAppVideo(uri: string | undefined): Promise<void> {
  if (!uri || !DIR || !uri.startsWith(DIR)) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri);
    }
  } catch {
    // ignore — file may already be gone
  }
}
