import { File as ExpoFile, FileMode, Paths } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { Image as ExpoImage } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import { StorageAccessFramework } from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { getThumbnailAsync } from "expo-video-thumbnails";
import { strFromU8, strToU8, Unzip, Zip, ZipPassThrough } from "fflate";
import type { MemoryRecord } from "@/context/RecordsContext";
import type { AppSettings } from "@/context/SettingsContext";
import { copyThumbnailToAppStorage } from "@/utils/storage";

const FORMAT = "memory-records-complete-backup";
const VERSION = 1;
const MANIFEST_ENTRY = "memory-records-complete-manifest.json";
const CHUNK_SIZE = 1024 * 1024;
const MAX_MANIFEST_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS = 100_000;
const MAX_MEDIA_FILES = 60_000;
const MAX_MEDIA_BYTES = 100 * 1024 * 1024 * 1024;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const CURRENT_DIR = FileSystem.documentDirectory ?? "";

type MediaField = "imageUri" | "videoUri" | "videoThumbnailUri" | "audioUri";

interface CompleteBackupMedia {
  recordId: string;
  field: MediaField;
  filename: string;
  size: number;
  crc32: number;
}

export interface CompleteBackupManifest {
  format: typeof FORMAT;
  version: typeof VERSION;
  createdAt: string;
  records: MemoryRecord[];
  tags: string[];
  settings: AppSettings;
  media: CompleteBackupMedia[];
}

export interface CompleteBackupInspection {
  archiveUri: string;
  manifest: CompleteBackupManifest;
}

export interface CompleteBackupProgress {
  current: number;
  total: number;
  label: string;
}

export interface CompleteRestoreResult {
  records: MemoryRecord[];
  tags: string[];
  settings: AppSettings;
  mediaCount: number;
  stagingDirectory: string;
}

const MEDIA_FIELDS: MediaField[] = [
  "imageUri",
  "videoUri",
  "videoThumbnailUri",
  "audioUri",
];
const MEDIA_FIELD_SET = new Set<string>(MEDIA_FIELDS);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function updateCrc32(crc: number, bytes: Uint8Array): number {
  let value = crc;
  for (let index = 0; index < bytes.length; index++) {
    value = CRC_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
  }
  return value >>> 0;
}

function finalCrc32(crc: number): number {
  return (crc ^ 0xffffffff) >>> 0;
}

function safePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "record";
}

function extensionFromUri(uri: string, field: MediaField): string {
  const match = uri.split("?")[0].match(/\.([a-zA-Z0-9]{1,8})$/);
  if (match?.[1]) return match[1].toLowerCase();
  if (field === "audioUri") return "m4a";
  if (field === "videoUri") return "mp4";
  return "jpg";
}

function readSize(uri: string): number {
  const handle = new ExpoFile(uri).open(FileMode.ReadOnly);
  try {
    const size = handle.size;
    if (size === null || size < 0) throw new Error("size is unavailable");
    return size;
  } finally {
    handle.close();
  }
}

function readChunkAt(uri: string, offset: number, length: number): Uint8Array {
  const handle = new ExpoFile(uri).open(FileMode.ReadOnly);
  try {
    handle.offset = offset;
    return handle.readBytes(length);
  } finally {
    handle.close();
  }
}

async function streamUriToAppFile(sourceUri: string, destinationUri: string): Promise<void> {
  const response = await expoFetch(sourceUri);
  if ((!response.ok && response.status !== 0) || !response.body) {
    throw new Error(`Native media read failed with status ${response.status}.`);
  }

  const destinationFile = new ExpoFile(destinationUri);
  destinationFile.create({ overwrite: true, intermediates: true });
  const reader = response.body.getReader();
  let written = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;

      let output: ReturnType<ExpoFile["open"]> | null = null;
      try {
        output = destinationFile.open(FileMode.Append);
        output.writeBytes(value);
        written += value.length;
      } finally {
        try {
          output?.close();
        } catch {
          // handle may already have been released
        }
      }
      if (written % (CHUNK_SIZE * 8) === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (written === 0 || readSize(destinationUri) !== written) {
    throw new Error("Native media copy was empty or incomplete.");
  }
}

async function resolveReadableMediaUri(
  uri: string,
  field: MediaField,
  fallbackUri: string,
): Promise<{ uri: string; temporary: boolean }> {
  try {
    readSize(uri);
    return { uri, temporary: false };
  } catch (originalError) {
    if (field === "imageUri") {
      const cachedPath = await ExpoImage.getCachePathAsync(uri).catch(() => null);
      if (cachedPath) {
        const cachedUri = cachedPath.startsWith("file://") ? cachedPath : `file://${cachedPath}`;
        try {
          readSize(cachedUri);
          return { uri: cachedUri, temporary: false };
        } catch {
          // Try the native streaming fallback below.
        }
      }
    }

    try {
      await streamUriToAppFile(uri, fallbackUri);
      return { uri: fallbackUri, temporary: true };
    } catch (fallbackError) {
      throw new Error(
        `${String(originalError)}; native streaming fallback also failed: ${String(fallbackError)}`,
      );
    }
  }
}

function assertCompleteZip(uri: string, expectedEntryCount?: number): void {
  const handle = new ExpoFile(uri).open(FileMode.ReadOnly);
  try {
    const total = handle.size;
    if (total === null || total < 22) throw new Error("Backup archive is incomplete.");
    const tailLength = Math.min(total, 22 + MAX_ZIP_COMMENT_BYTES);
    handle.offset = total - tailLength;
    const tail = handle.readBytes(tailLength);

    for (let index = tail.length - 22; index >= 0; index--) {
      if (
        tail[index] !== 0x50 ||
        tail[index + 1] !== 0x4b ||
        tail[index + 2] !== 0x05 ||
        tail[index + 3] !== 0x06
      ) {
        continue;
      }
      const view = new DataView(tail.buffer, tail.byteOffset + index, tail.length - index);
      const diskNumber = view.getUint16(4, true);
      const centralDirectoryDisk = view.getUint16(6, true);
      const entriesOnDisk = view.getUint16(8, true);
      const totalEntries = view.getUint16(10, true);
      const centralDirectorySize = view.getUint32(12, true);
      const centralDirectoryOffset = view.getUint32(16, true);
      const commentLength = view.getUint16(20, true);
      const eocdOffset = total - tailLength + index;
      if (
        diskNumber !== 0 ||
        centralDirectoryDisk !== 0 ||
        entriesOnDisk !== totalEntries ||
        eocdOffset + 22 + commentLength !== total ||
        centralDirectoryOffset + centralDirectorySize > eocdOffset ||
        (expectedEntryCount !== undefined && totalEntries !== expectedEntryCount)
      ) {
        throw new Error("Backup ZIP directory is invalid or incomplete.");
      }
      return;
    }
    throw new Error("Backup ZIP end record was not found.");
  } finally {
    handle.close();
  }
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function validateSettings(value: unknown): value is AppSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<AppSettings>;
  return (
    typeof settings.vaultName === "string" &&
    typeof settings.folder === "string" &&
    typeof settings.configured === "boolean" &&
    ["fr-FR", "it-IT", "en-US"].includes(String(settings.voiceLanguage)) &&
    typeof settings.authorName === "string" &&
    Number.isInteger(settings.maxInternationalEvents) &&
    Number.isInteger(settings.maxNationalEvents)
  );
}

function validateManifest(value: unknown): CompleteBackupManifest {
  if (!value || typeof value !== "object") throw new Error("Backup manifest is not an object.");
  const manifest = value as Partial<CompleteBackupManifest>;
  if (manifest.format !== FORMAT || manifest.version !== VERSION) {
    throw new Error("Unsupported complete backup format or version.");
  }
  if (!Array.isArray(manifest.records) || !Array.isArray(manifest.tags) || !Array.isArray(manifest.media)) {
    throw new Error("Backup manifest is missing records, tags, or media.");
  }
  if (manifest.records.length > MAX_RECORDS || manifest.media.length > MAX_MEDIA_FILES) {
    throw new Error("Backup contains more records or media files than supported.");
  }
  if (!validateSettings(manifest.settings)) throw new Error("Backup settings are invalid.");
  if (typeof manifest.createdAt !== "string" || !Number.isFinite(Date.parse(manifest.createdAt))) {
    throw new Error("Backup creation date is invalid.");
  }
  if (!manifest.tags.every((tag) => typeof tag === "string")) {
    throw new Error("Backup tags are invalid.");
  }

  const recordIds = new Set<string>();
  for (const valueRecord of manifest.records) {
    if (!valueRecord || typeof valueRecord !== "object") throw new Error("Backup contains an invalid record.");
    const record = valueRecord as MemoryRecord;
    if (typeof record.id !== "string" || typeof record.note !== "string" || recordIds.has(record.id)) {
      throw new Error("Backup contains an invalid or duplicate record ID.");
    }
    recordIds.add(record.id);
  }

  const filenames = new Set<string>();
  const mediaKeys = new Set<string>();
  let totalMediaBytes = 0;
  for (const valueMedia of manifest.media) {
    if (!valueMedia || typeof valueMedia !== "object") throw new Error("Backup media entry is invalid.");
    const media = valueMedia as CompleteBackupMedia;
    const key = `${media.recordId}:${media.field}`;
    if (
      !recordIds.has(media.recordId) ||
      !MEDIA_FIELD_SET.has(media.field) ||
      !/^[a-zA-Z0-9_.-]+$/.test(media.filename) ||
      !Number.isSafeInteger(media.size) ||
      media.size < 0 ||
      !Number.isInteger(media.crc32) ||
      media.crc32 < 0 ||
      media.crc32 > 0xffffffff ||
      filenames.has(media.filename) ||
      mediaKeys.has(key)
    ) {
      throw new Error("Backup contains an unsafe, duplicate, or malformed media entry.");
    }
    filenames.add(media.filename);
    mediaKeys.add(key);
    totalMediaBytes += media.size;
    if (!Number.isSafeInteger(totalMediaBytes) || totalMediaBytes > MAX_MEDIA_BYTES) {
      throw new Error("Backup media size exceeds the supported limit.");
    }
  }

  for (const record of manifest.records) {
    for (const field of MEDIA_FIELDS) {
      const valueUri = record[field];
      const media = manifest.media.find((entry) => entry.recordId === record.id && entry.field === field);
      if (media && valueUri !== `backup://${media.filename}`) {
        throw new Error(`Media reference mismatch for record ${record.id}.`);
      }
      if (!media && typeof valueUri === "string" && valueUri.startsWith("backup://")) {
        throw new Error(`Unresolved media reference for record ${record.id}.`);
      }
    }
  }
  return manifest as CompleteBackupManifest;
}

function requireManifest(value: CompleteBackupManifest | null): CompleteBackupManifest {
  if (!value) throw new Error("Complete backup manifest was not found.");
  return value;
}

async function writeZipEntryFromUri(
  zip: Zip,
  entryName: string,
  sourceUri: string,
): Promise<{ size: number; crc32: number }> {
  const entry = new ZipPassThrough(entryName);
  zip.add(entry);
  let size = 0;
  let crc = 0xffffffff;
  const total = readSize(sourceUri);
  if (total === 0) entry.push(new Uint8Array(0), true);
  while (size < total) {
    const chunk = readChunkAt(sourceUri, size, Math.min(CHUNK_SIZE, total - size));
    if (chunk.length === 0) throw new Error("Media ended before the expected size.");
    size += chunk.length;
    crc = updateCrc32(crc, chunk);
    entry.push(chunk, size === total);
    if (size % (CHUNK_SIZE * 8) === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return { size, crc32: finalCrc32(crc) };
}

async function copyFileToSafInChunks(
  sourceUri: string,
  destinationUri: string,
  onProgress?: (copied: number, total: number) => void,
): Promise<void> {
  const total = readSize(sourceUri);
  const destinationFile = new ExpoFile(destinationUri);
  let copied = 0;

  while (copied < total) {
    let destination: ReturnType<ExpoFile["open"]> | null = null;
    try {
      const chunk = readChunkAt(sourceUri, copied, Math.min(CHUNK_SIZE, total - copied));
      if (chunk.length === 0) throw new Error("Staged archive ended before the expected size.");

      destination = destinationFile.open(FileMode.Append);
      destination.writeBytes(chunk);
      copied += chunk.length;
      onProgress?.(copied, total);
    } finally {
      try {
        destination?.close();
      } catch {
        // handle may already have been released
      }
    }
    if (copied % (CHUNK_SIZE * 8) === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
}

export async function createCompleteBackup(
  parentUri: string | null,
  records: MemoryRecord[],
  tags: string[],
  settings: AppSettings,
  onProgress?: (progress: CompleteBackupProgress) => void,
): Promise<{ filename: string; mediaCount: number; skippedThumbnailCount: number; delivery: "saved" | "shared" }> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    throw new Error("Complete backups require the Android or iPhone app.");
  }
  if (Platform.OS === "android" && !parentUri) {
    throw new Error("Choose a folder for the complete backup.");
  }
  if (Platform.OS === "ios" && !(await Sharing.isAvailableAsync())) {
    throw new Error("The iPhone share sheet is unavailable. Please try again on your device.");
  }
  const backedUpRecords = records.map((record) => ({ ...record }));
  const mediaSources: Array<{ record: MemoryRecord; field: MediaField; uri: string }> = [];
  let skippedThumbnailCount = 0;
  let stagingBytesRequired = MAX_MANIFEST_BYTES;
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) throw new Error("App cache storage is unavailable.");
  const fallbackDirectory =
    `${cacheDirectory}complete-backup-media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}/`;
  await FileSystem.makeDirectoryAsync(fallbackDirectory, { intermediates: true });

  try {
    for (const record of records) {
      for (const field of MEDIA_FIELDS) {
        const originalUri = record[field];
        if (typeof originalUri !== "string" || originalUri.length === 0) continue;
        let uri: string;
        let sourceSize: number;
        try {
          const extension = extensionFromUri(originalUri, field);
          const fallbackUri =
            `${fallbackDirectory}${safePart(record.id)}_${field}.${extension}`;
          const resolved = await resolveReadableMediaUri(originalUri, field, fallbackUri);
          uri = resolved.uri;
          sourceSize = readSize(uri);
        } catch (error) {
          if (field === "videoThumbnailUri") {
            // Video thumbnails are derived, optional files. Android can revoke
            // access to the temporary thumbnail while the copied video remains
            // readable. Restore safely falls back to the play-icon placeholder.
            const target = backedUpRecords.find((item) => item.id === record.id);
            if (target) target.videoThumbnailUri = undefined;
            skippedThumbnailCount++;
            continue;
          }
          throw new Error(`Cannot read ${field} for memory ${record.id}: ${String(error)}`);
        }
        stagingBytesRequired += sourceSize;
        if (!Number.isSafeInteger(stagingBytesRequired) || stagingBytesRequired > MAX_MEDIA_BYTES) {
          throw new Error("Backup media size exceeds the supported limit.");
        }
        mediaSources.push({ record, field, uri });
      }
    }
    if (stagingBytesRequired > Paths.availableDiskSpace * 0.9) {
      throw new Error("There is not enough free device storage to stage the complete backup safely.");
    }
  } catch (error) {
    await FileSystem.deleteAsync(fallbackDirectory, { idempotent: true }).catch(() => {});
    throw error;
  }

  const filename = `memory-records-complete-${new Date().toISOString().replace(/[:.]/g, "-")}.mrbak`;
  const stagingUri = `${fallbackDirectory}${filename}`;
  let destinationUri: string | null = null;
  let zipError: Error | null = null;
  let archiveBytes = 0;
  const media: CompleteBackupMedia[] = [];

  try {
    const stagingFile = new ExpoFile(stagingUri);
    stagingFile.create({ overwrite: false, intermediates: true });
    const zip = new Zip((error, chunk) => {
      if (error) {
        zipError = error;
        return;
      }
      let chunkOutput: ReturnType<ExpoFile["open"]> | null = null;
      try {
        chunkOutput = stagingFile.open(FileMode.Append);
        chunkOutput.writeBytes(chunk);
        archiveBytes += chunk.length;
      } catch (writeError) {
        zipError = writeError instanceof Error ? writeError : new Error(String(writeError));
      } finally {
        try {
          chunkOutput?.close();
        } catch {
          // handle may already have been released
        }
      }
    });

    for (let index = 0; index < mediaSources.length; index++) {
      const { record, field, uri } = mediaSources[index];
      onProgress?.({ current: index + 1, total: mediaSources.length, label: "Archiving media" });
      const extension = extensionFromUri(uri, field);
      const filenamePart = `${String(index + 1).padStart(4, "0")}_${safePart(record.id)}_${field}.${extension}`;
      const integrity = await writeZipEntryFromUri(zip, `media/${filenamePart}`, uri);
      if (zipError) throw zipError;
      media.push({ recordId: record.id, field, filename: filenamePart, ...integrity });
      const target = backedUpRecords.find((item) => item.id === record.id);
      if (target) target[field] = `backup://${filenamePart}`;
    }

    const manifest: CompleteBackupManifest = {
      format: FORMAT,
      version: VERSION,
      createdAt: new Date().toISOString(),
      records: backedUpRecords,
      tags,
      settings,
      media,
    };
    const manifestEntry = new ZipPassThrough(MANIFEST_ENTRY);
    zip.add(manifestEntry);
    manifestEntry.push(strToU8(JSON.stringify(manifest)), true);
    zip.end();
    if (zipError) throw zipError;

    if (readSize(stagingUri) !== archiveBytes) {
      throw new Error("Staged archive size verification failed.");
    }
    assertCompleteZip(stagingUri, media.length + 1);

    onProgress?.({
      current: mediaSources.length,
      total: mediaSources.length,
      label: "Saving verified archive",
    });
    if (Platform.OS === "ios") {
      // Keep the verified file alive until the native sheet has finished.
      // Resolution does not distinguish saving from dismissing the sheet.
      await Sharing.shareAsync(stagingUri, {
        mimeType: "application/zip",
        UTI: "public.zip-archive",
        dialogTitle: "Save Complete Backup to Files",
      });
    } else {
      destinationUri = await StorageAccessFramework.createFileAsync(
        parentUri!,
        filename,
        "application/zip",
      );
      await copyFileToSafInChunks(stagingUri, destinationUri, (copied, total) => {
        onProgress?.({
          current: copied,
          total,
          label: "Saving verified archive",
        });
      });

      if (readSize(destinationUri) !== archiveBytes) {
        throw new Error("Saved archive size verification failed.");
      }
      assertCompleteZip(destinationUri, media.length + 1);
    }
    await FileSystem.deleteAsync(stagingUri, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(fallbackDirectory, { idempotent: true }).catch(() => {});
    return {
      filename, mediaCount: media.length, skippedThumbnailCount,
      delivery: Platform.OS === "ios" ? "shared" : "saved",
    };
  } catch (error) {
    if (destinationUri) {
      await StorageAccessFramework.deleteAsync(destinationUri, { idempotent: true }).catch(() => {});
    }
    await FileSystem.deleteAsync(stagingUri, { idempotent: true }).catch(() => {});
    await FileSystem.deleteAsync(fallbackDirectory, { idempotent: true }).catch(() => {});
    throw error;
  }
}

export async function inspectCompleteBackup(archiveUri: string): Promise<CompleteBackupInspection> {
  assertCompleteZip(archiveUri);
  let streamError: Error | null = null;
  let manifest: CompleteBackupManifest | null = null;
  const unzip = new Unzip((entry) => {
    if (entry.name !== MANIFEST_ENTRY) {
      entry.terminate();
      return;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    entry.ondata = (error, chunk, final) => {
      if (error) {
        streamError = error;
        return;
      }
      total += chunk.length;
      if (total > MAX_MANIFEST_BYTES) {
        streamError = new Error("Backup manifest is too large.");
        entry.terminate();
        return;
      }
      chunks.push(chunk);
      if (final) {
        try {
          manifest = validateManifest(JSON.parse(strFromU8(concatChunks(chunks, total))));
        } catch (errorValue) {
          streamError = errorValue instanceof Error ? errorValue : new Error(String(errorValue));
        }
      }
    };
    entry.start();
  });

  const total = readSize(archiveUri);
  if (total === 0) throw new Error("Backup archive is empty.");
  let read = 0;
  while (read < total) {
    const chunk = readChunkAt(archiveUri, read, Math.min(CHUNK_SIZE, total - read));
    if (chunk.length === 0) throw new Error("Backup archive ended unexpectedly.");
    read += chunk.length;
    unzip.push(chunk, read === total);
    if (streamError) throw streamError;
    if (read % (CHUNK_SIZE * 8) === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (streamError) throw streamError;
  const completedManifest = requireManifest(manifest);
  assertCompleteZip(archiveUri, completedManifest.media.length + 1);
  return { archiveUri, manifest: completedManifest };
}

export async function restoreCompleteBackup(
  inspection: CompleteBackupInspection,
  onProgress?: (progress: CompleteBackupProgress) => void,
): Promise<CompleteRestoreResult> {
  if (!CURRENT_DIR) throw new Error("App document storage is unavailable.");
  const requiredBytes = inspection.manifest.media.reduce((total, entry) => total + entry.size, 0);
  if (requiredBytes > Paths.availableDiskSpace * 0.9) {
    throw new Error("There is not enough free device storage to restore this backup safely.");
  }
  const restoreId = `complete-restore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stagingDirectory = `${CURRENT_DIR}${restoreId}/`;
  await FileSystem.makeDirectoryAsync(stagingDirectory, { intermediates: true });

  const restoredRecords = inspection.manifest.records.map((record) => ({ ...record }));
  const expected = new Map<string, CompleteBackupMedia>(
    inspection.manifest.media.map((entry) => [`media/${entry.filename}`, entry] as const),
  );
  const seen = new Set<string>();
  let streamError: Error | null = null;
  let completed = 0;

  const unzip = new Unzip((archiveEntry) => {
    if (archiveEntry.name === MANIFEST_ENTRY) {
      archiveEntry.terminate();
      return;
    }
    const expectedMedia = expected.get(archiveEntry.name);
    if (!expectedMedia || seen.has(archiveEntry.name)) {
      streamError = new Error(`Unexpected or duplicate archive entry: ${archiveEntry.name}`);
      archiveEntry.terminate();
      return;
    }
    seen.add(archiveEntry.name);

    const extension = extensionFromUri(expectedMedia.filename, expectedMedia.field);
    const localName = `${safePart(expectedMedia.recordId)}_${expectedMedia.field}.${extension}`;
    const destinationUri = `${stagingDirectory}${localName}`;
    const destinationFile = new ExpoFile(destinationUri);
    destinationFile.create({ overwrite: false, intermediates: true });
    let size = 0;
    let crc = 0xffffffff;

    archiveEntry.ondata = (error, chunk, final) => {
      if (error) {
        streamError = error;
        return;
      }
      let destination: ReturnType<ExpoFile["open"]> | null = null;
      try {
        if (size + chunk.length > expectedMedia.size) {
          streamError = new Error(`Media entry exceeds its declared size: ${expectedMedia.filename}`);
          archiveEntry.terminate();
          return;
        }
        destination = destinationFile.open(FileMode.Append);
        destination.writeBytes(chunk);
        size += chunk.length;
        crc = updateCrc32(crc, chunk);
        if (final) {
          if (size !== expectedMedia.size || finalCrc32(crc) !== expectedMedia.crc32) {
            streamError = new Error(`Integrity verification failed for ${expectedMedia.filename}`);
            return;
          }
          const record = restoredRecords.find((item) => item.id === expectedMedia.recordId);
          if (!record) {
            streamError = new Error(`Record ${expectedMedia.recordId} is missing.`);
            return;
          }
          record[expectedMedia.field] = destinationUri;
          completed++;
          onProgress?.({
            current: completed,
            total: inspection.manifest.media.length,
            label: "Restoring media",
          });
        }
      } catch (errorValue) {
        streamError = errorValue instanceof Error ? errorValue : new Error(String(errorValue));
      } finally {
        try {
          destination?.close();
        } catch {
          // handle may already have been released
        }
      }
    };
    archiveEntry.start();
  });

  try {
    const total = readSize(inspection.archiveUri);
    if (total === 0) throw new Error("Backup archive is empty.");
    let read = 0;
    while (read < total) {
      const chunk = readChunkAt(inspection.archiveUri, read, Math.min(CHUNK_SIZE, total - read));
      if (chunk.length === 0) throw new Error("Backup archive ended unexpectedly.");
      read += chunk.length;
      unzip.push(chunk, read === total);
      if (streamError) throw streamError;
      if (read % (CHUNK_SIZE * 8) === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (streamError) throw streamError;
    if (seen.size !== expected.size || completed !== expected.size) {
      throw new Error("One or more media files are missing from the archive.");
    }

    for (const record of restoredRecords) {
      if (!record.videoUri || record.videoThumbnailUri) continue;
      try {
        const thumbnail = await getThumbnailAsync(record.videoUri, { time: 0, quality: 0.7 });
        const thumbnailUri = await copyThumbnailToAppStorage(thumbnail.uri, stagingDirectory);
        record.videoThumbnailUri = thumbnailUri;
      } catch {
        // A thumbnail is derived and optional; the video remains playable.
      }
    }

    return {
      records: restoredRecords,
      tags: inspection.manifest.tags,
      settings: inspection.manifest.settings,
      mediaCount: expected.size,
      stagingDirectory,
    };
  } catch (error) {
    await FileSystem.deleteAsync(stagingDirectory, { idempotent: true }).catch(() => {});
    throw error;
  }
}

export async function discardCompleteRestore(result: CompleteRestoreResult): Promise<void> {
  await FileSystem.deleteAsync(result.stagingDirectory, { idempotent: true }).catch(() => {});
}