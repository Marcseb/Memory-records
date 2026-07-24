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
import * as FileSystem from "expo-file-system";

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
