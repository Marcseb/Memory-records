/**
 * Verified, local automatic snapshots.
 *
 * Snapshot files and the content-addressed media vault deliberately live below
 * documentDirectory.  No account, network service, or background scheduler is
 * involved.  Media is copied a megabyte at a time so a long video is never
 * retained in a JavaScript buffer.
 */
import { File as ExpoFile, FileMode } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { Image as ExpoImage } from "expo-image";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import type { MemoryRecord } from "@/context/RecordsContext";
import type { AppSettings } from "@/context/SettingsContext";

const ROOT = FileSystem.documentDirectory ?? "";
const SNAPSHOT_DIR = `${ROOT}local-snapshots/`;
const MEDIA_DIR = `${SNAPSHOT_DIR}media/`;
const INDEX_FILE = "local-snapshots/index.json";
const CHUNK_SIZE = 1024 * 1024;
const FORMAT = "memory-records-local-snapshot";
const VERSION = 2;
const MEDIA_FIELDS = ["imageUri", "videoUri", "videoThumbnailUri", "audioUri"] as const;
type MediaField = (typeof MEDIA_FIELDS)[number];

export interface SnapshotMedia {
  recordId: string;
  field: MediaField;
  ref: string;
  sha256: string;
  size: number;
  crc32: number;
  extension: string;
  /** Source identity used only to reuse media without re-hashing it. Older
   * manifests omit these fields and automatically take the full safe path. */
  sourceUri?: string;
  sourceSize?: number;
  sourceModificationTime?: number;
}

export interface LocalSnapshotManifest {
  format: typeof FORMAT;
  version: typeof VERSION;
  id: string;
  createdAt: string;
  fingerprint: string;
  records: MemoryRecord[];
  tags: string[];
  settings: AppSettings;
  media: SnapshotMedia[];
}

export interface SnapshotSummary {
  id: string;
  createdAt: string;
  recordCount: number;
  mediaCount: number;
  status: "verified" | "invalid";
  uri: string;
}

interface SnapshotIndex {
  snapshots: Array<{ id: string; createdAt: string }>;
  lastAttemptDate?: string;
  lastCompletedDate?: string;
  lastSuccessId?: string;
  lastSuccessAt?: string;
  lastError?: string;
  /** False when recovered from a damaged index; callers must commit a new
   * index before doing any destructive retention or GC work. */
  trusted?: boolean;
  /** Persisted after index reconstruction. Cleanup stays disabled because a
   * transient read failure may have omitted an older manifest. */
  cleanupBlocked?: boolean;
}

export interface SnapshotStatus {
  lastSuccessAt?: string;
  lastError?: string;
  lastAttemptDate?: string;
  cleanupBlocked: boolean;
}

export interface SnapshotProgress {
  stage: string;
  current: number;
  total: number;
  unit?: "bytes";
}

type SnapshotProgressCallback = (progress: SnapshotProgress) => void;

export interface StagedSnapshotRestore {
  records: MemoryRecord[];
  tags: string[];
  settings: AppSettings;
  mediaCount: number;
  stagingDirectory: string;
}

let snapshotInProgress = false;
let snapshotMutationQueue: Promise<void> = Promise.resolve();
let snapshotMutationActive = false;
const IS_SNAPSHOT_TEST_BUILD = Constants.expoConfig?.extra?.snapshotTestBuild === true;
export const SNAPSHOT_CHANGE_LOGIC_VERSION = 2;

function runSnapshotMutation<T>(operation: () => Promise<T>): Promise<T> {
  const guarded = async () => {
    snapshotMutationActive = true;
    try { return await operation(); }
    finally { snapshotMutationActive = false; }
  };
  const result = snapshotMutationQueue.then(guarded, guarded);
  snapshotMutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function isLocalSnapshotOperationActive(): boolean {
  return snapshotMutationActive;
}

function snapshotNow(settings: AppSettings): Date {
  if (IS_SNAPSHOT_TEST_BUILD && settings.snapshotTestDate) {
    const simulated = new Date(settings.snapshotTestDate);
    if (Number.isFinite(simulated.getTime())) return simulated;
  }
  return new Date();
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let n = i;
    for (let bit = 0; bit < 8; bit++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    table[i] = n >>> 0;
  }
  return table;
})();

function crcUpdate(crc: number, bytes: Uint8Array): number {
  let value = crc;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}
function crcFinal(crc: number): number { return (crc ^ 0xffffffff) >>> 0; }

/* Small incremental SHA-256 implementation. It operates only on the chunks
 * supplied by the caller, which is important for multi-gigabyte videos. */
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function shaRor(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

class IncrementalSha256 {
  private readonly state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly block = new Uint8Array(64);
  private blockLength = 0;
  private byteLength = 0;

  update(bytes: Uint8Array): void {
    this.byteLength += bytes.length;
    let offset = 0;
    while (offset < bytes.length) {
      const take = Math.min(64 - this.blockLength, bytes.length - offset);
      this.block.set(bytes.subarray(offset, offset + take), this.blockLength);
      this.blockLength += take;
      offset += take;
      if (this.blockLength === 64) {
        this.compress(this.block);
        this.blockLength = 0;
      }
    }
  }

  digestHex(): string {
    const copy = new IncrementalSha256();
    copy.state.set(this.state);
    copy.block.set(this.block);
    copy.blockLength = this.blockLength;
    copy.byteLength = this.byteLength;
    const bitLength = this.byteLength * 8;
    const paddingLength = this.blockLength < 56 ? 56 - this.blockLength : 120 - this.blockLength;
    const padding = new Uint8Array(paddingLength + 8);
    padding[0] = 0x80;
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    padding[padding.length - 8] = (high >>> 24) & 0xff;
    padding[padding.length - 7] = (high >>> 16) & 0xff;
    padding[padding.length - 6] = (high >>> 8) & 0xff;
    padding[padding.length - 5] = high & 0xff;
    padding[padding.length - 4] = (low >>> 24) & 0xff;
    padding[padding.length - 3] = (low >>> 16) & 0xff;
    padding[padding.length - 2] = (low >>> 8) & 0xff;
    padding[padding.length - 1] = low & 0xff;
    copy.update(padding);
    return Array.from(copy.state, (word) => word.toString(16).padStart(8, "0")).join("");
  }

  private compress(block: Uint8Array): void {
    const words = new Uint32Array(64);
    for (let i = 0; i < 16; i++) {
      const offset = i * 4;
      words[i] = ((block[offset] << 24) | (block[offset + 1] << 16) |
        (block[offset + 2] << 8) | block[offset + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = words[i - 15];
      const y = words[i - 2];
      const s0 = shaRor(x, 7) ^ shaRor(x, 18) ^ (x >>> 3);
      const s1 = shaRor(y, 17) ^ shaRor(y, 19) ^ (y >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = this.state;
    for (let i = 0; i < 64; i++) {
      const sum1 = shaRor(e, 6) ^ shaRor(e, 11) ^ shaRor(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + SHA_K[i] + words[i]) >>> 0;
      const sum0 = shaRor(a, 2) ^ shaRor(a, 13) ^ shaRor(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
    this.state[4] = (this.state[4] + e) >>> 0;
    this.state[5] = (this.state[5] + f) >>> 0;
    this.state[6] = (this.state[6] + g) >>> 0;
    this.state[7] = (this.state[7] + h) >>> 0;
  }
}

function file(uri: string): ExpoFile { return new ExpoFile(uri); }

function readSize(uri: string): number {
  const handle = file(uri).open(FileMode.ReadOnly);
  try {
    const size = handle.size;
    if (size === null || size < 0) throw new Error("size unavailable");
    return size;
  } finally { handle.close(); }
}

function readChunk(uri: string, offset: number, length: number): Uint8Array {
  const handle = file(uri).open(FileMode.ReadOnly);
  try {
    handle.offset = offset;
    return handle.readBytes(length);
  } finally { handle.close(); }
}

async function streamToFile(source: string, destination: string): Promise<void> {
  const response = await expoFetch(source);
  if ((!response.ok && response.status !== 0) || !response.body) {
    throw new Error(`media read failed (${response.status})`);
  }
  const outputFile = file(destination);
  outputFile.create({ overwrite: true, intermediates: true });
  const reader = response.body.getReader();
  let written = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value?.length) continue;
      const handle = outputFile.open(FileMode.Append);
      try { handle.writeBytes(next.value); } finally { handle.close(); }
      written += next.value.length;
    }
  } finally { reader.releaseLock(); }
  if (!written || readSize(destination) !== written) throw new Error("media stream was incomplete");
}

function extension(uri: string, field: MediaField): string {
  const match = uri.split("?")[0].match(/\.([a-zA-Z0-9]{1,8})$/);
  if (match?.[1]) return match[1].toLowerCase();
  return field === "audioUri" ? "m4a" : field === "videoUri" ? "mp4" : "jpg";
}

async function readableUri(uri: string, field: MediaField, fallback: string): Promise<string> {
  try { readSize(uri); return uri; } catch (firstError) {
    if (field === "imageUri") {
      const cached = await ExpoImage.getCachePathAsync(uri).catch(() => null);
      if (cached) {
        const cachedUri = cached.startsWith("file://") ? cached : `file://${cached}`;
        try { readSize(cachedUri); return cachedUri; } catch { /* stream below */ }
      }
    }
    try {
      await streamToFile(uri, fallback);
      return fallback;
    } catch (secondError) {
      throw new Error(`${String(firstError)}; streaming fallback failed: ${String(secondError)}`);
    }
  }
}

function todayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function weekKey(date: Date): string {
  const first = new Date(date.getFullYear(), 0, 1);
  return `${date.getFullYear()}-${Math.floor((date.getTime() - first.getTime()) / 604800000)}`;
}
function monthKey(date: Date): string { return `${date.getFullYear()}-${date.getMonth() + 1}`; }

function stableFingerprint(records: MemoryRecord[], tags: string[], settings: AppSettings): string {
  const { snapshotTestDate: _snapshotTestDate, ...persistentSettings } = settings;
  // JSON is deterministic because all app objects are created with stable keys.
  return JSON.stringify({ records, tags: [...tags].sort(), settings: persistentSettings });
}

function legacyStableFingerprint(
  records: MemoryRecord[],
  tags: string[],
  settings: AppSettings,
  snapshotTestDate: string | undefined,
): string {
  return JSON.stringify({
    records,
    tags: [...tags].sort(),
    settings: { ...settings, snapshotTestDate },
  });
}

async function ensureDirectories(): Promise<void> {
  if (!ROOT) throw new Error("App document storage is unavailable.");
  await FileSystem.makeDirectoryAsync(SNAPSHOT_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
}

async function writeAtomicJson(uri: string, value: unknown): Promise<void> {
  const tempUri = `${uri}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const temp = file(tempUri);
  let moved = false;
  try {
    temp.create({ overwrite: false, intermediates: true });
    temp.write(JSON.stringify(value));
    JSON.parse(await temp.text());
    await temp.move(file(uri), { overwrite: true });
    moved = true;
  } finally {
    if (!moved) await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  }
}

async function reconstructIndex(): Promise<SnapshotIndex> {
  const entries = await FileSystem.readDirectoryAsync(SNAPSHOT_DIR);
  const snapshots: Array<{ id: string; createdAt: string }> = [];
  const verifiedVault: VerifiedVaultMedia = new Map();
  for (const name of entries) {
    if (!/^snapshot-[a-zA-Z0-9_-]+\.json$/.test(name)) continue;
    const id = name.slice(0, -".json".length);
    try {
      const manifest = await loadManifest(id, verifiedVault);
      snapshots.push({ id: manifest.id, createdAt: manifest.createdAt });
    } catch {
      // Invalid manifests are intentionally not trusted or deleted during
      // recovery. They can be surfaced later by an explicit cleanup.
    }
  }
  return { snapshots, trusted: false, cleanupBlocked: true };
}

function deduplicateSnapshotEntries(
  snapshots: Array<{ id: string; createdAt: string }>,
): Array<{ id: string; createdAt: string }> {
  const byId = new Map<string, { id: string; createdAt: string }>();
  for (const entry of snapshots) byId.set(entry.id, entry);
  return [...byId.values()];
}

async function readIndex(): Promise<SnapshotIndex> {
  if (!ROOT) throw new Error("App document storage is unavailable.");
  const indexUri = `${ROOT}${INDEX_FILE}`;
  let info;
  try {
    info = await FileSystem.getInfoAsync(indexUri);
  } catch (error) {
    throw new Error(`Snapshot index could not be inspected: ${String(error)}`);
  }
  if (!info.exists) {
    // A missing index is safe only when the snapshot directory is also
    // missing. If manifests exist, reconstruct them instead of treating the
    // index as an empty inventory (which could make GC delete their media).
    let directoryInfo;
    try {
      directoryInfo = await FileSystem.getInfoAsync(SNAPSHOT_DIR);
    } catch (error) {
      throw new Error(`Snapshot directory could not be inspected: ${String(error)}`);
    }
    if (!directoryInfo.exists) return { snapshots: [], trusted: true };
    return reconstructIndex();
  }
  try {
    const raw = await FileSystem.readAsStringAsync(indexUri);
    const parsed = JSON.parse(raw) as SnapshotIndex;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.snapshots)) {
      throw new Error("snapshot index has an invalid shape");
    }
    for (const entry of parsed.snapshots) {
      if (!entry || typeof entry.id !== "string" ||
        !/^snapshot-[a-zA-Z0-9_-]+$/.test(entry.id) ||
        typeof entry.createdAt !== "string") {
        throw new Error("snapshot index has an invalid entry");
      }
    }
    const snapshots = deduplicateSnapshotEntries(parsed.snapshots);
    if (snapshots.length !== parsed.snapshots.length) {
      // Preserve status/error/cleanup metadata while atomically repairing only
      // the duplicated inventory entries. This makes recovery idempotent and
      // prevents the warning from recurring on every app launch.
      await writeIndex({ ...parsed, snapshots });
      console.info("[LocalSnapshots] duplicate snapshot index entries repaired.");
    }
    return { ...parsed, snapshots, trusted: true };
  } catch (error) {
    console.warn("[LocalSnapshots] index recovery:", error);
    // A corrupt/unreadable index must never become an empty trusted index.
    // Reconstruct only from manifests that pass full media verification.
    return reconstructIndex();
  }
}

async function writeIndex(index: SnapshotIndex): Promise<void> {
  const { trusted: _trusted, ...persisted } = index;
  await writeAtomicJson(`${ROOT}${INDEX_FILE}`, persisted);
}

function validateManifest(value: unknown): LocalSnapshotManifest {
  if (!value || typeof value !== "object") throw new Error("snapshot manifest is not an object");
  const manifest = value as Partial<LocalSnapshotManifest>;
  if (manifest.format !== FORMAT || manifest.version !== VERSION || typeof manifest.id !== "string") {
    throw new Error("unsupported snapshot manifest");
  }
  if (!Array.isArray(manifest.records) || !Array.isArray(manifest.tags) || !Array.isArray(manifest.media)) {
    throw new Error("snapshot manifest is incomplete");
  }
  const ids = new Set<string>();
  for (const record of manifest.records) {
    if (!record || typeof record.id !== "string" || typeof record.note !== "string" || ids.has(record.id)) {
      throw new Error("snapshot contains an invalid or duplicate record");
    }
    ids.add(record.id);
  }
  const keys = new Set<string>();
  for (const media of manifest.media) {
    if (!media || !ids.has(media.recordId) || !MEDIA_FIELDS.includes(media.field as MediaField) ||
      !/^snapshot-media:\/\/[a-f0-9]{64}$/.test(String(media.ref)) ||
      !/^[a-z0-9]{1,8}$/.test(String(media.extension)) ||
      !/^[a-f0-9]{64}$/.test(String(media.sha256)) ||
      media.ref !== `snapshot-media://${media.sha256}` ||
      !Number.isSafeInteger(media.size) || media.size < 0 ||
      !Number.isInteger(media.crc32) || media.crc32 < 0 || media.crc32 > 0xffffffff) {
      throw new Error("snapshot contains unsafe media metadata");
    }
    const key = `${media.recordId}:${media.field}`;
    if (keys.has(key)) throw new Error("snapshot contains duplicate media");
    keys.add(key);
  }
  for (const record of manifest.records) {
    for (const field of MEDIA_FIELDS) {
      const uri = record[field];
      if (typeof uri === "string" && uri.startsWith("snapshot-media://") &&
        !manifest.media.some((media) => media.recordId === record.id && media.field === field && media.ref === uri)) {
        throw new Error("snapshot contains an unresolved media reference");
      }
    }
  }
  if (!manifest.settings || typeof manifest.createdAt !== "string" ||
    !Number.isFinite(Date.parse(manifest.createdAt)) || typeof manifest.fingerprint !== "string") {
    throw new Error("snapshot metadata is invalid");
  }
  return manifest as LocalSnapshotManifest;
}

type VerifiedVaultMedia = Map<string, Pick<SnapshotMedia, "size" | "crc32" | "sha256">>;

async function verifyVaultMedia(
  media: SnapshotMedia,
  verified: VerifiedVaultMedia,
  onBytes?: (current: number, total: number) => void,
): Promise<void> {
  const hash = media.ref.slice("snapshot-media://".length);
  const prior = verified.get(hash);
  if (prior) {
    if (prior.size !== media.size || prior.crc32 !== media.crc32 || prior.sha256 !== media.sha256) {
      throw new Error(`conflicting vault metadata for ${hash}`);
    }
    return;
  }
  const vaultUri = `${MEDIA_DIR}${hash}.blob`;
  if (readSize(vaultUri) !== media.size) throw new Error(`vault size mismatch for ${hash}`);
  let crc = 0xffffffff;
  const sha = new IncrementalSha256();
  let offset = 0;
  while (offset < media.size) {
    const bytes = readChunk(vaultUri, offset, Math.min(CHUNK_SIZE, media.size - offset));
    if (!bytes.length) throw new Error(`vault ended early for ${hash}`);
    crc = crcUpdate(crc, bytes);
    sha.update(bytes);
    offset += bytes.length;
    onBytes?.(offset, media.size);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (crcFinal(crc) !== media.crc32 || sha.digestHex() !== media.sha256) {
    throw new Error(`vault checksum mismatch for ${hash}`);
  }
  verified.set(hash, { size: media.size, crc32: media.crc32, sha256: media.sha256 });
}

async function loadManifest(
  id: string,
  verified: VerifiedVaultMedia = new Map(),
  onBytes?: (current: number, total: number) => void,
): Promise<LocalSnapshotManifest> {
  const manifest = await loadManifestMetadata(id);
  // A manifest is not valid merely because its JSON parses: verify every
  // referenced vault object before exposing it to restore or retention. The
  // shared map ensures deduplicated blobs are hashed once per operation.
  for (const media of manifest.media) {
    await verifyVaultMedia(media, verified, onBytes);
  }
  return manifest;
}

async function loadManifestMetadata(id: string): Promise<LocalSnapshotManifest> {
  const uri = `${SNAPSHOT_DIR}${id}.json`;
  const raw = await FileSystem.readAsStringAsync(uri);
  return validateManifest(JSON.parse(raw));
}

async function getSourceIdentity(uri: string): Promise<{
  size: number;
  modificationTime: number;
} | null> {
  // Only document-directory files have app-controlled identity semantics.
  // Content providers, external files, and caches always take the full hash path.
  if (!ROOT || !uri.startsWith(ROOT)) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (
      !info.exists ||
      info.isDirectory ||
      typeof info.size !== "number" ||
      typeof info.modificationTime !== "number" ||
      info.modificationTime <= 0
    ) return null;
    return { size: info.size, modificationTime: info.modificationTime };
  } catch {
    return null;
  }
}

async function copyVerifiedToVault(
  sourceUri: string,
  hash: string,
  size: number,
  crc32: number,
  sha256: string,
): Promise<void> {
  // A canonical extension keeps identical bytes deduplicated across media
  // fields whose original file extensions differ.
  const destination = `${MEDIA_DIR}${hash}.blob`;
  try {
    if (readSize(destination) === size) {
      let existingCrc = 0xffffffff;
      const existingSha = new IncrementalSha256();
      let existingOffset = 0;
      while (existingOffset < size) {
        const bytes = readChunk(destination, existingOffset, Math.min(CHUNK_SIZE, size - existingOffset));
        if (!bytes.length) throw new Error("existing vault media ended early");
        existingCrc = crcUpdate(existingCrc, bytes);
        existingSha.update(bytes);
        existingOffset += bytes.length;
      }
      if (crcFinal(existingCrc) === crc32 && existingSha.digestHex() === sha256) return;
      await FileSystem.deleteAsync(destination, { idempotent: true });
    }
  } catch { /* create below */ }
  const temporaryUri = `${destination}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const temporary = file(temporaryUri);
  try {
    temporary.create({ overwrite: false, intermediates: true });
    let offset = 0;
    let crc = 0xffffffff;
    const sha = new IncrementalSha256();
    while (offset < size) {
      const bytes = readChunk(sourceUri, offset, Math.min(CHUNK_SIZE, size - offset));
      if (!bytes.length) throw new Error("media ended during vault copy");
      const handle = temporary.open(FileMode.Append);
      try { handle.writeBytes(bytes); } finally { handle.close(); }
      crc = crcUpdate(crc, bytes);
      sha.update(bytes);
      offset += bytes.length;
      if (offset % (CHUNK_SIZE * 8) === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    if (offset !== size || crcFinal(crc) !== crc32 || sha.digestHex() !== sha256 || readSize(temporaryUri) !== size) {
      throw new Error("vault media verification failed");
    }
    try { await temporary.move(file(destination), { overwrite: false }); }
    catch {
      // Another snapshot may have won the race; it is safe only if verified.
      if (readSize(destination) !== size) throw new Error("vault media commit failed");
      let winnerCrc = 0xffffffff;
      const winnerSha = new IncrementalSha256();
      let winnerOffset = 0;
      while (winnerOffset < size) {
        const bytes = readChunk(destination, winnerOffset, Math.min(CHUNK_SIZE, size - winnerOffset));
        if (!bytes.length) throw new Error("vault media winner ended early");
        winnerCrc = crcUpdate(winnerCrc, bytes);
        winnerSha.update(bytes);
        winnerOffset += bytes.length;
      }
      if (crcFinal(winnerCrc) !== crc32 || winnerSha.digestHex() !== sha256) {
        throw new Error("vault media winner failed verification");
      }
    }
  } finally {
    await FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => {});
  }
}

async function selectRetained(
  manifests: LocalSnapshotManifest[],
  lastCreatedId?: string,
): Promise<LocalSnapshotManifest[]> {
  const sorted = [...manifests].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const chosen = new Set<string>();
  const addBucket = (key: (date: Date) => string, limit: number) => {
    const seen = new Set<string>();
    for (const manifest of sorted) {
      const bucket = key(new Date(manifest.createdAt));
      if (seen.has(bucket)) continue;
      seen.add(bucket);
      chosen.add(manifest.id);
      if (seen.size >= limit) break;
    }
  };
  addBucket(todayKey, 7);
  addBucket(weekKey, 4);
  addBucket(monthKey, 3);
  if (lastCreatedId && manifests.some((manifest) => manifest.id === lastCreatedId)) {
    chosen.add(lastCreatedId);
  } else if (sorted[0]) {
    chosen.add(sorted[0].id);
  }
  return sorted.filter((manifest) => chosen.has(manifest.id));
}

async function garbageCollect(
  retained: LocalSnapshotManifest[],
  all: LocalSnapshotManifest[],
  afterCommit = false,
): Promise<void> {
  // The creator calls this only after its manifest and retention set have
  // committed. Other callers must not race an in-progress media copy.
  if (snapshotInProgress && !afterCommit) return;
  const referenced = new Set(retained.flatMap((manifest) => manifest.media.map((media) =>
    media.ref.slice("snapshot-media://".length))));
  for (const manifest of all) {
    if (retained.some((item) => item.id === manifest.id)) continue;
    await FileSystem.deleteAsync(`${SNAPSHOT_DIR}${manifest.id}.json`, { idempotent: true }).catch(() => {});
  }
  try {
    for (const name of await FileSystem.readDirectoryAsync(MEDIA_DIR)) {
      if (!name.endsWith(".blob") || name.includes(".tmp-")) continue;
      const hash = name.slice(0, -".blob".length);
      if (!referenced.has(hash)) await FileSystem.deleteAsync(`${MEDIA_DIR}${name}`, { idempotent: true }).catch(() => {});
    }
  } catch { /* storage may be unavailable during app teardown */ }
}

export async function getSnapshotStatus(): Promise<SnapshotStatus> {
  const index = await readIndex();
  return {
    lastAttemptDate: index.lastAttemptDate,
    lastSuccessAt: index.lastSuccessAt,
    lastError: index.lastError,
    cleanupBlocked: index.cleanupBlocked === true,
  };
}

export async function listLocalSnapshots(): Promise<SnapshotSummary[]> {
  await ensureDirectories();
  const index = await readIndex();
  const summaries: SnapshotSummary[] = [];
  for (const entry of index.snapshots) {
    try {
      // History display only needs a structurally valid manifest. Re-hashing
      // every photo and video here can keep the JavaScript thread saturated
      // long after Settings is closed. Full vault verification remains
      // mandatory before restore, deletion/retention, and snapshot commit.
      const manifest = await loadManifestMetadata(entry.id);
      summaries.push({ id: manifest.id, createdAt: manifest.createdAt, recordCount: manifest.records.length,
        mediaCount: manifest.media.length, status: "verified", uri: `${SNAPSHOT_DIR}${manifest.id}.json` });
    } catch {
      summaries.push({ id: entry.id, createdAt: entry.createdAt, recordCount: 0, mediaCount: 0,
        status: "invalid", uri: `${SNAPSHOT_DIR}${entry.id}.json` });
    }
  }
  return summaries.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

async function createLocalSnapshotUnlocked(
  records: MemoryRecord[], tags: string[], settings: AppSettings,
  onProgress?: SnapshotProgressCallback,
): Promise<SnapshotSummary> {
  if (snapshotInProgress) throw new Error("another snapshot is already in progress");
  snapshotInProgress = true;
  let fallbackDirectory: string | null = null;
  try {
    await ensureDirectories();
    const initialIndex = await readIndex();
    const baselineEntry =
      initialIndex.snapshots.find((entry) => entry.id === initialIndex.lastSuccessId) ??
      initialIndex.snapshots.find((entry) => entry.createdAt === initialIndex.lastSuccessAt);
    let baselineManifest: LocalSnapshotManifest | null = null;
    if (baselineEntry) {
      try {
        baselineManifest = await loadManifestMetadata(baselineEntry.id);
      } catch (error) {
        console.warn("[LocalSnapshots] incremental baseline unavailable:", error);
      }
    }
    const verifiedVault: VerifiedVaultMedia = new Map();
    const id = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    fallbackDirectory = `${FileSystem.cacheDirectory ?? MEDIA_DIR}local-snapshot-${id}/`;
    await FileSystem.makeDirectoryAsync(fallbackDirectory, { intermediates: true });
    const copiedRecords = records.map((record) => ({ ...record }));
    const media: SnapshotMedia[] = [];
    onProgress?.({ stage: "Preparing snapshot", current: 0, total: records.length });
    for (let recordIndex = 0; recordIndex < records.length; recordIndex++) {
      const record = records[recordIndex];
      onProgress?.({
        stage: "Verifying records and media",
        current: recordIndex + 1,
        total: records.length,
      });
      for (const field of MEDIA_FIELDS) {
        const original = record[field];
        if (typeof original !== "string" || !original) continue;
        const sourceIdentity = await getSourceIdentity(original);
        const reusable = sourceIdentity
          ? baselineManifest?.media.find((item) =>
            item.recordId === record.id &&
            item.field === field &&
            item.sourceUri === original &&
            item.sourceSize === sourceIdentity.size &&
            item.sourceModificationTime === sourceIdentity.modificationTime)
          : undefined;
        let reusableVaultAvailable = false;
        if (reusable) {
          try {
            reusableVaultAvailable =
              readSize(`${MEDIA_DIR}${reusable.ref.slice("snapshot-media://".length)}.blob`) === reusable.size;
          } catch {
            reusableVaultAvailable = false;
          }
        }
        if (reusable && reusableVaultAvailable) {
          media.push({ ...reusable });
          const target = copiedRecords.find((item) => item.id === record.id);
          if (target) target[field] = reusable.ref;
          continue;
        }
        const fallback = `${fallbackDirectory}${record.id}-${field}.${extension(original, field)}`;
        let source: string;
        try { source = await readableUri(original, field, fallback); }
        catch (error) {
          if (field === "videoThumbnailUri") {
            const target = copiedRecords.find((item) => item.id === record.id);
            if (target) target.videoThumbnailUri = undefined;
            continue;
          }
          throw new Error(`Cannot read ${field} for memory ${record.id}: ${String(error)}`);
        }
        const size = readSize(source);
        let crc = 0xffffffff;
        const sha = new IncrementalSha256();
        let offset = 0;
        while (offset < size) {
          const bytes = readChunk(source, offset, Math.min(CHUNK_SIZE, size - offset));
          if (!bytes.length) throw new Error(`Cannot read ${field} for memory ${record.id}`);
          crc = crcUpdate(crc, bytes);
          sha.update(bytes);
          offset += bytes.length;
          // Native file reads and hashing are synchronous. Yield after each
          // bounded chunk so progress can render and navigation stays responsive.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        const crc32 = crcFinal(crc);
        const sha256 = sha.digestHex();
        const hash = sha256;
        const ext = extension(source, field);
        await copyVerifiedToVault(source, hash, size, crc32, sha256);
        const ref = `snapshot-media://${hash}`;
        const confirmedSourceIdentity = source === original
          ? await getSourceIdentity(original)
          : null;
        const sourceIdentityStable =
          sourceIdentity !== null &&
          confirmedSourceIdentity !== null &&
          sourceIdentity.size === confirmedSourceIdentity.size &&
          sourceIdentity.modificationTime === confirmedSourceIdentity.modificationTime &&
          confirmedSourceIdentity.size === size;
        const mediaEntry: SnapshotMedia = {
          recordId: record.id,
          field,
          ref,
          sha256,
          size,
          crc32,
          extension: ext,
          sourceUri: sourceIdentityStable ? original : undefined,
          sourceSize: sourceIdentityStable ? confirmedSourceIdentity.size : undefined,
          sourceModificationTime: sourceIdentityStable
            ? confirmedSourceIdentity.modificationTime
            : undefined,
        };
        media.push(mediaEntry);
        // copyVerifiedToVault has just verified this exact destination.
        verifiedVault.set(hash, { size, crc32, sha256 });
        const target = copiedRecords.find((item) => item.id === record.id);
        if (target) target[field] = ref;
      }
    }
    const manifest: LocalSnapshotManifest = {
      format: FORMAT, version: VERSION, id, createdAt: snapshotNow(settings).toISOString(),
      fingerprint: stableFingerprint(records, tags, settings), records: copiedRecords, tags: [...tags],
      settings, media,
    };
    onProgress?.({ stage: "Finalizing verified snapshot", current: records.length, total: records.length });
    validateManifest(manifest);
    await writeAtomicJson(`${SNAPSHOT_DIR}${id}.json`, manifest);
    await loadManifest(id, verifiedVault);
    const index = await readIndex();
    const next = { ...index, snapshots: [
      ...index.snapshots.filter((entry) => entry.id !== id),
      { id, createdAt: manifest.createdAt },
    ],
      lastSuccessId: id, lastSuccessAt: manifest.createdAt, lastError: undefined };
    await writeIndex(next);
    const all: LocalSnapshotManifest[] = [];
    let inventoryComplete = true;
    for (const item of next.snapshots) {
      try {
        all.push(await loadManifest(item.id, verifiedVault));
      } catch (error) {
        inventoryComplete = false;
        console.warn(`[LocalSnapshots] retention verification failed for ${item.id}:`, error);
      }
    }
    if (!inventoryComplete || index.cleanupBlocked) {
      // Keep every indexed entry and disable cleanup persistently. A temporary
      // read failure is not evidence that a restore point can be discarded.
      await writeIndex({ ...next, cleanupBlocked: true });
    } else {
      const retained = await selectRetained(all, id);
      await writeIndex({ ...next, snapshots: retained.map((item) => ({ id: item.id, createdAt: item.createdAt })) });
      await garbageCollect(retained, all, true);
    }
    // A recovered/missing index has not provided a complete inventory. The
    // newly committed retained index is safe for future runs, but this run
    // must not delete media based on an incomplete reconstruction.
    return { id, createdAt: manifest.createdAt, recordCount: records.length, mediaCount: media.length, status: "verified", uri: `${SNAPSHOT_DIR}${id}.json` };
  } finally {
    if (fallbackDirectory) {
      await FileSystem.deleteAsync(fallbackDirectory, { idempotent: true }).catch(() => {});
    }
    snapshotInProgress = false;
  }
}

export function createLocalSnapshot(
  records: MemoryRecord[], tags: string[], settings: AppSettings,
  onProgress?: SnapshotProgressCallback,
): Promise<SnapshotSummary> {
  return runSnapshotMutation(async () => {
    const snapshot = await createLocalSnapshotUnlocked(records, tags, settings, onProgress);
    const index = await readIndex();
    const today = todayKey(snapshotNow(settings));
    await writeIndex({
      ...index,
      lastAttemptDate: today,
      lastCompletedDate: today,
      lastError: undefined,
    });
    return snapshot;
  });
}

async function maybeCreateAutomaticSnapshotUnlocked(
  records: MemoryRecord[], tags: string[], settings: AppSettings,
  onProgress?: SnapshotProgressCallback,
): Promise<SnapshotStatus> {
  const checkStarted = Date.now();
  const index = await readIndex();
  console.info(`[LocalSnapshots] Index read: ${Date.now() - checkStarted}ms; ${index.snapshots.length} restore points.`);
  const today = todayKey(snapshotNow(settings));
  const lastSuccessfulEntry =
    index.snapshots.find((entry) => entry.id === index.lastSuccessId) ??
    index.snapshots.find((entry) => entry.createdAt === index.lastSuccessAt);
  if (index.lastCompletedDate === today && index.lastSuccessAt) {
    if (lastSuccessfulEntry) {
      try {
        const manifest = await loadManifestMetadata(lastSuccessfulEntry.id);
        if (
          manifest.createdAt === index.lastSuccessAt &&
          todayKey(new Date(manifest.createdAt)) === today
        ) {
          console.info("[LocalSnapshots] Today's snapshot check is already complete.");
          return getSnapshotStatus();
        }
      } catch (error) {
        console.warn("[LocalSnapshots] Completed snapshot manifest is unavailable:", error);
      }
    }
  }
  try {
    onProgress?.({ stage: "Checking for changes", current: 0, total: records.length });
    if (records.length === 0 && index.snapshots.length > 0) {
      for (const entry of index.snapshots) {
        const retained = await loadManifestMetadata(entry.id);
        if (retained.records.length > 0) {
          throw new Error(
            "Automatic snapshot stopped because the current record list is unexpectedly empty.",
          );
        }
      }
    }
    const comparisonEntry = lastSuccessfulEntry ?? [...index.snapshots].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )[0];
    if (comparisonEntry) {
      const manifestStarted = Date.now();
      const manifest = await loadManifestMetadata(comparisonEntry.id);
      console.info(`[LocalSnapshots] Baseline metadata read: ${Date.now() - manifestStarted}ms.`);
      const fingerprintStarted = Date.now();
      const currentFingerprint = stableFingerprint(records, tags, settings);
      console.info(`[LocalSnapshots] Change comparison prepared: ${Date.now() - fingerprintStarted}ms; ${records.length} records.`);
      const matchesLegacyTestFingerprint =
        IS_SNAPSHOT_TEST_BUILD &&
        manifest.fingerprint === legacyStableFingerprint(
          records,
          tags,
          settings,
          manifest.settings.snapshotTestDate,
        );
      if (manifest.fingerprint === currentFingerprint || matchesLegacyTestFingerprint) {
        console.info(`[LocalSnapshots] No changes; check completed in ${Date.now() - checkStarted}ms.`);
        await writeIndex({
          ...index,
          lastAttemptDate: today,
          lastSuccessId: comparisonEntry.id,
          lastSuccessAt: manifest.createdAt,
          lastError: undefined,
        });
        return getSnapshotStatus();
      }
    }
    // Give React Native time to paint the progress card before synchronous
    // native reads and incremental hashing begin.
    onProgress?.({ stage: "Starting verified snapshot", current: 0, total: records.length });
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    console.info("[LocalSnapshots] Creating automatic snapshot.");
    await createLocalSnapshotUnlocked(records, tags, settings, onProgress);
    const completedIndex = await readIndex();
    await writeIndex({
      ...completedIndex,
      lastAttemptDate: today,
      lastCompletedDate: today,
      lastError: undefined,
    });
    console.info("[LocalSnapshots] Automatic snapshot completed.");
  } catch (error) {
    const message = String(error).slice(0, 240);
    console.warn("[LocalSnapshots] automatic snapshot failed:", error);
    const failedIndex = await readIndex().catch(() => index);
    // Do not mark today as attempted. A failed or interrupted snapshot should
    // retry the next time the app reaches an idle foreground state.
    await writeIndex({ ...failedIndex, lastError: message });
  }
  return getSnapshotStatus();
}

export function maybeCreateAutomaticSnapshot(
  records: MemoryRecord[], tags: string[], settings: AppSettings,
  onProgress?: SnapshotProgressCallback,
): Promise<SnapshotStatus> {
  return runSnapshotMutation(() =>
    maybeCreateAutomaticSnapshotUnlocked(records, tags, settings, onProgress));
}

export async function stageLocalSnapshotRestore(
  id: string,
  onProgress?: SnapshotProgressCallback,
): Promise<StagedSnapshotRestore> {
  onProgress?.({ stage: "Reading snapshot", current: 0, total: 0 });
  const manifest = await loadManifestMetadata(id);
  const verifiedVault: VerifiedVaultMedia = new Map();
  for (let index = 0; index < manifest.media.length; index++) {
    onProgress?.({
      stage: "Verifying snapshot media",
      current: index + 1,
      total: manifest.media.length,
    });
    await verifyVaultMedia(manifest.media[index], verifiedVault);
  }
  const stagingDirectory = `${ROOT}local-restore-${id}-${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(stagingDirectory, { intermediates: true });
  const records = manifest.records.map((record) => ({ ...record }));
  try {
    for (let index = 0; index < manifest.media.length; index++) {
      const media = manifest.media[index];
      onProgress?.({
        stage: "Preparing restored media",
        current: index + 1,
        total: manifest.media.length,
      });
      const hash = media.ref.slice("snapshot-media://".length);
      const source = `${MEDIA_DIR}${hash}.blob`;
      const destination = `${stagingDirectory}${media.recordId}-${media.field}.${media.extension}`;
      const output = file(destination);
      output.create({ overwrite: false, intermediates: true });
      let offset = 0;
      let crc = 0xffffffff;
      const sha = new IncrementalSha256();
      while (offset < media.size) {
        const bytes = readChunk(source, offset, Math.min(CHUNK_SIZE, media.size - offset));
        if (!bytes.length) throw new Error(`restore media ended early: ${hash}`);
        const handle = output.open(FileMode.Append);
        try { handle.writeBytes(bytes); } finally { handle.close(); }
        crc = crcUpdate(crc, bytes);
        sha.update(bytes);
        offset += bytes.length;
      }
      if (offset !== media.size || crcFinal(crc) !== media.crc32 ||
        sha.digestHex() !== media.sha256 || readSize(destination) !== media.size) {
        throw new Error(`restore verification failed: ${hash}`);
      }
      const target = records.find((record) => record.id === media.recordId);
      if (!target) throw new Error(`restore record is missing: ${media.recordId}`);
      target[media.field] = destination;
    }
    onProgress?.({
      stage: "Snapshot verified and ready",
      current: records.length,
      total: records.length,
    });
    return { records, tags: manifest.tags, settings: manifest.settings, mediaCount: manifest.media.length, stagingDirectory };
  } catch (error) {
    await FileSystem.deleteAsync(stagingDirectory, { idempotent: true }).catch(() => {});
    throw error;
  }
}

export async function discardLocalSnapshotRestore(result: StagedSnapshotRestore): Promise<void> {
  await FileSystem.deleteAsync(result.stagingDirectory, { idempotent: true }).catch(() => {});
}

async function resetSnapshotTestHistoryUnlocked(): Promise<void> {
  if (!IS_SNAPSHOT_TEST_BUILD) {
    throw new Error("Snapshot history reset is available only in the snapshot test build.");
  }
  if (snapshotInProgress) throw new Error("Wait for the current snapshot operation to finish.");
  snapshotInProgress = true;
  try {
    await FileSystem.deleteAsync(SNAPSHOT_DIR, { idempotent: true });
    await ensureDirectories();
    await writeIndex({ snapshots: [], trusted: true });
  } finally {
    snapshotInProgress = false;
  }
}

export function resetSnapshotTestHistory(): Promise<void> {
  return runSnapshotMutation(resetSnapshotTestHistoryUnlocked);
}

async function deleteLocalSnapshotUnlocked(
  id: string,
  onProgress?: SnapshotProgressCallback,
): Promise<void> {
  const started = Date.now();
  const index = await readIndex();
  const indexTrusted = index.trusted !== false;
  let inventoryComplete = true;
  const valid: LocalSnapshotManifest[] = [];
  // Shared content-addressed blobs are verified once in this serialized
  // operation, never once per retained snapshot or persisted across operations.
  const verifiedVault: VerifiedVaultMedia = new Map();
  for (let position = 0; position < index.snapshots.length; position++) {
    const entry = index.snapshots[position];
    const stage = `Checking snapshot ${position + 1} of ${index.snapshots.length}`;
    onProgress?.({ stage, current: position, total: index.snapshots.length });
    try {
      valid.push(await loadManifest(entry.id, verifiedVault, (current, total) =>
        onProgress?.({ stage: `${stage} · verifying media`, current, total, unit: "bytes" })));
    } catch (error) {
      inventoryComplete = false;
      console.warn(`[LocalSnapshots] delete verification failed for ${entry.id}:`, error);
    }
  }
  const newest = [...valid].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (newest?.id === id) throw new Error("The newest verified snapshot is protected.");
  const kept = index.snapshots.filter((entry) => entry.id !== id);
  // These manifests and all their media were verified above. The exclusive
  // mutation queue prevents another snapshot operation changing the vault.
  const manifests = valid.filter((manifest) => manifest.id !== id);
  onProgress?.({ stage: "Updating snapshot history", current: 0, total: 1 });
  if (!inventoryComplete || index.cleanupBlocked) {
    await writeIndex({ ...index, cleanupBlocked: true, snapshots: kept });
  } else {
    const retained = await selectRetained(manifests);
    await writeIndex({ ...index, snapshots: retained.map((item) => ({ id: item.id, createdAt: item.createdAt })) });
    if (indexTrusted) await garbageCollect(retained, valid);
  }
  await FileSystem.deleteAsync(`${SNAPSHOT_DIR}${id}.json`, { idempotent: true });
  onProgress?.({ stage: "Snapshot removed", current: 1, total: 1 });
  console.info(`[LocalSnapshots] Delete completed: ${Date.now() - started}ms; ${verifiedVault.size} unique media verified.`);
}

export function deleteLocalSnapshot(id: string, onProgress?: SnapshotProgressCallback): Promise<void> {
  return runSnapshotMutation(() => deleteLocalSnapshotUnlocked(id, onProgress));
}