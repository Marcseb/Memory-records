/**
 * Persistent JSON storage backed by FileSystem.documentDirectory.
 *
 * Why not AsyncStorage?
 * In Expo Go, AsyncStorage is namespaced by the experience identity
 * (currentProjectId in the manifest). Each new deployment can produce a new
 * projectId, silently creating a fresh namespace and making previous data
 * invisible. FileSystem.documentDirectory is tied to the device and is
 * unaffected by experience identity changes.
 *
 * Migration: on first read, if no file exists we fall back to AsyncStorage
 * and, if found, write the data to the file so future reads bypass AsyncStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
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
  await FileSystem.writeAsStringAsync(path, JSON.stringify(data));
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
