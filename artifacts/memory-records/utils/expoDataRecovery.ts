import * as FileSystem from "expo-file-system/legacy";
import type { MemoryRecord } from "@/context/RecordsContext";

const RECORDS_FILE = "mr_records.json";
const TAGS_FILE = "mr_tags.json";
const CURRENT_DIR = FileSystem.documentDirectory ?? "";

export interface ExpoRecoveryCandidate {
  scopeUri: string;
  scopeName: string;
  records: MemoryRecord[];
  tags: string[];
}

export interface ExpoRecoveryResult {
  records: MemoryRecord[];
  tags: string[];
  mediaCopied: number;
  mediaMissing: number;
}

function withTrailingSlash(uri: string): string {
  return uri.endsWith("/") ? uri : `${uri}/`;
}

function parentDirectory(uri: string): string | null {
  const normalized = uri.replace(/\/+$/, "");
  const slash = normalized.lastIndexOf("/");
  if (slash < 0) return null;
  return normalized.slice(0, slash + 1);
}

function isMemoryRecord(value: unknown): value is MemoryRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MemoryRecord>;
  return typeof record.id === "string" && typeof record.note === "string";
}

async function readJson<T>(uri: string): Promise<T | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return JSON.parse(await FileSystem.readAsStringAsync(uri)) as T;
  } catch {
    return null;
  }
}

/**
 * Finds Memory Records files left in older Expo Go experience directories.
 * This is read-only; recovery does not begin until the user confirms it.
 */
export async function scanPreviousExpoData(): Promise<ExpoRecoveryCandidate[]> {
  if (!CURRENT_DIR) return [];
  const experienceRoot = parentDirectory(CURRENT_DIR);
  if (!experienceRoot || !experienceRoot.includes("/ExperienceData/")) return [];

  let scopeNames: string[];
  try {
    scopeNames = await FileSystem.readDirectoryAsync(experienceRoot);
  } catch {
    return [];
  }

  const currentNormalized = withTrailingSlash(CURRENT_DIR);
  const candidates: ExpoRecoveryCandidate[] = [];

  for (const scopeName of scopeNames) {
    const scopeUri = withTrailingSlash(`${experienceRoot}${scopeName}`);
    if (scopeUri === currentNormalized) continue;

    const rawRecords = await readJson<unknown>(`${scopeUri}${RECORDS_FILE}`);
    if (!Array.isArray(rawRecords)) continue;
    const records = rawRecords.filter(isMemoryRecord);
    if (records.length === 0) continue;

    const rawTags = await readJson<unknown>(`${scopeUri}${TAGS_FILE}`);
    const tags = Array.isArray(rawTags)
      ? rawTags.filter((tag): tag is string => typeof tag === "string")
      : [];

    candidates.push({ scopeUri, scopeName, records, tags });
  }

  return candidates.sort((a, b) => {
    const newestA = Math.max(...a.records.map((record) => record.createdAt || 0));
    const newestB = Math.max(...b.records.map((record) => record.createdAt || 0));
    return newestB - newestA;
  });
}

function extensionFromUri(uri: string, fallback: string): string {
  const match = uri.split("?")[0].match(/\.([a-zA-Z0-9]{1,8})$/);
  return match?.[1]?.toLowerCase() ?? fallback;
}

async function copyRecoveredMedia(
  sourceUri: string | undefined,
  sourceScope: string,
  category: "images" | "videos" | "thumbnails" | "audio",
  index: number,
): Promise<{ uri?: string; copied: boolean; missing: boolean }> {
  if (!sourceUri || !sourceUri.startsWith(sourceScope) || !CURRENT_DIR) {
    return { uri: sourceUri, copied: false, missing: false };
  }

  try {
    const info = await FileSystem.getInfoAsync(sourceUri);
    if (!info.exists) return { uri: sourceUri, copied: false, missing: true };

    const destinationDir = `${CURRENT_DIR}recovered/${category}/`;
    await FileSystem.makeDirectoryAsync(destinationDir, { intermediates: true });
    const fallback = category === "audio" ? "m4a" : category === "videos" ? "mp4" : "jpg";
    const extension = extensionFromUri(sourceUri, fallback);
    const nonce = Math.random().toString(36).slice(2, 8);
    const destinationUri = `${destinationDir}${category}_${Date.now()}_${index}_${nonce}.${extension}`;
    await FileSystem.copyAsync({ from: sourceUri, to: destinationUri });
    return { uri: destinationUri, copied: true, missing: false };
  } catch {
    return { uri: sourceUri, copied: false, missing: true };
  }
}

/**
 * Copies records and their app-owned media from one old Expo Go scope.
 * The source directory is never modified or deleted.
 */
export async function recoverPreviousExpoData(
  candidate: ExpoRecoveryCandidate,
): Promise<ExpoRecoveryResult> {
  let mediaCopied = 0;
  let mediaMissing = 0;
  const records: MemoryRecord[] = [];

  for (let index = 0; index < candidate.records.length; index++) {
    const source = candidate.records[index];
    const image = await copyRecoveredMedia(source.imageUri, candidate.scopeUri, "images", index);
    const video = await copyRecoveredMedia(source.videoUri, candidate.scopeUri, "videos", index);
    const thumbnail = await copyRecoveredMedia(
      source.videoThumbnailUri,
      candidate.scopeUri,
      "thumbnails",
      index,
    );
    const audio = await copyRecoveredMedia(source.audioUri, candidate.scopeUri, "audio", index);

    const copied = [image, video, thumbnail, audio].filter((item) => item.copied).length;
    const missing = [image, video, thumbnail, audio].filter((item) => item.missing).length;
    mediaCopied += copied;
    mediaMissing += missing;

    records.push({
      ...source,
      imageUri: image.uri,
      videoUri: video.uri,
      videoThumbnailUri: thumbnail.uri,
      audioUri: audio.uri,
    });
  }

  return { records, tags: candidate.tags, mediaCopied, mediaMissing };
}