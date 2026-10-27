const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const fflate = require("fflate");

// Exercise the real streaming ZIP code with an in-memory native file adapter.
// Native share-sheet / Files-provider behavior still needs a physical iPhone.
async function fixture(os = "ios", { shareError, available = true } = {}) {
  const files = new Map();
  const shared = [];
  let safCalls = 0;
  let maxRead = 0;
  class File {
    constructor(uri) { this.uri = uri; }
    create() { files.set(this.uri, Buffer.alloc(0)); }
    open(mode) {
      const uri = this.uri;
      if (!files.has(uri)) throw new Error(`Missing file: ${uri}`);
      return {
        size: files.get(uri).length,
        offset: 0,
        readBytes(length) {
          maxRead = Math.max(maxRead, length);
          return new Uint8Array(files.get(uri).subarray(this.offset, this.offset + length));
        },
        writeBytes(bytes) {
          assert.equal(mode, "a");
          files.set(uri, Buffer.concat([files.get(uri), bytes]));
        },
        close() {},
      };
    }
  }
  const legacy = {
    documentDirectory: "file:///documents/",
    cacheDirectory: "file:///cache/",
    async makeDirectoryAsync() {},
    async deleteAsync(uri) {
      for (const key of files.keys()) {
        if (key === uri || (uri.endsWith("/") && key.startsWith(uri))) files.delete(key);
      }
    },
    StorageAccessFramework: {
      async createFileAsync(parent, filename) {
        safCalls++;
        const uri = `${parent}/${filename}`;
        files.set(uri, Buffer.alloc(0));
        return uri;
      },
      async deleteAsync(uri) { files.delete(uri); },
    },
  };
  const mocks = {
    "expo-file-system": { File, FileMode: { ReadOnly: "r", Append: "a" }, Paths: { availableDiskSpace: 1e10 } },
    "expo-file-system/legacy": legacy,
    "expo/fetch": { fetch: async () => { throw new Error("Unexpected fallback"); } },
    "expo-image": { Image: { getCachePathAsync: async () => null } },
    "expo-sharing": {
      isAvailableAsync: async () => available,
      async shareAsync(uri, options) {
        assert.equal(options.UTI, "public.zip-archive");
        assert.match(uri, /memory-records-complete-.*\.mrbak$/);
        assert.ok(files.has(uri), "archive must exist while sheet is open");
        shared.push(Buffer.from(files.get(uri)));
        if (shareError) throw shareError;
      },
    },
    "react-native": { Platform: { OS: os } },
    "expo-video-thumbnails": { getThumbnailAsync: async () => { throw new Error("No thumbnail"); } },
    "@/utils/storage": { copyThumbnailToAppStorage: async () => { throw new Error("No thumbnail"); } },
    fflate,
  };
  const context = vm.createContext({ setTimeout, Uint8Array, TextEncoder, TextDecoder });
  const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, "../utils/completeBackup.ts"), "utf8"));
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async (name) => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    const values = mocks[name];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const media = {
    imageUri: "file:///documents/photo.heic",
    videoUri: "file:///documents/video.mov",
    audioUri: "file:///documents/voice.m4a",
  };
  for (const [field, uri] of Object.entries(media)) {
    // More than one streaming chunk, with nontrivial binary contents.
    files.set(uri, Buffer.alloc(1024 * 1024 + 37, field.length));
  }
  const records = [{ id: "memory-1", note: "All media", ...media }];
  const settings = {
    vaultName: "Vault", folder: "Memories", configured: true,
    voiceLanguage: "en-US", authorName: "", maxInternationalEvents: 3, maxNationalEvents: 3,
  };
  return {
    api: module.namespace, files, shared, records, settings, media,
    get safCalls() { return safCalls; },
    get maxRead() { return maxRead; },
  };
}

async function archive(f) {
  return f.api.createCompleteBackup(
    "content://folder", f.records, ["travel"], f.settings,
  );
}

test("iPhone shares a portable archive and photos, video, and voice round-trip byte-for-byte", async () => {
  const f = await fixture();
  const original = JSON.stringify(f.records);
  const result = await f.api.createCompleteBackup(null, f.records, ["travel"], f.settings);
  assert.equal(result.delivery, "shared"); // Not proof of Save to Files.
  assert.equal(result.mediaCount, 3);
  assert.equal(f.safCalls, 0);
  assert.equal(JSON.stringify(f.records), original);
  assert.equal([...f.files.keys()].some((uri) => uri.startsWith("file:///cache/")), false);
  const picked = "file:///cache/DocumentPicker/chosen.mrbak";
  f.files.set(picked, f.shared[0]);
  const inspection = await f.api.inspectCompleteBackup(picked);
  const restored = await f.api.restoreCompleteBackup(inspection);
  for (const [field, uri] of Object.entries(f.media)) {
    assert.match(restored.records[0][field], /complete-restore-/);
    assert.deepEqual(f.files.get(restored.records[0][field]), f.files.get(uri));
  }
  assert.equal(f.maxRead <= 1024 * 1024, true);
  assert.equal(restored.tags[0], "travel");
  assert.equal(restored.settings.vaultName, "Vault");
  await f.api.discardCompleteRestore(restored);
  assert.equal([...f.files.keys()].some((uri) => uri.includes("complete-restore-")), false);
});

test("Android still saves through SAF and its archive restores on iPhone", async () => {
  const android = await fixture("android");
  const result = await archive(android);
  assert.equal(result.delivery, "saved");
  assert.equal(android.safCalls, 1);
  assert.equal(android.shared.length, 0);
  const ios = await fixture();
  const picked = "file:///cache/from-android.mrbak";
  ios.files.set(picked, android.files.get(`content://folder/${result.filename}`));
  const restored = await ios.api.restoreCompleteBackup(await ios.api.inspectCompleteBackup(picked));
  for (const [field, uri] of Object.entries(android.media)) {
    assert.deepEqual(ios.files.get(restored.records[0][field]), android.files.get(uri));
  }
});

test("share failure and unavailable sharing never leave temporary archives", async () => {
  for (const options of [{ shareError: new Error("Share failed") }, { available: false }]) {
    const f = await fixture("ios", options);
    await assert.rejects(archive(f), /Share failed|unavailable/);
    assert.equal([...f.files.keys()].some((uri) => uri.startsWith("file:///cache/")), false);
    for (const uri of Object.values(f.media)) assert.ok(f.files.has(uri));
  }
});

test("truncation is rejected and corrupt media removes staging without touching originals", async () => {
  const f = await fixture();
  await archive(f);
  const picked = "file:///cache/damaged.mrbak";
  f.files.set(picked, f.shared[0].subarray(0, f.shared[0].length - 22));
  await assert.rejects(f.api.inspectCompleteBackup(picked), /end record|incomplete/);
  const entries = fflate.unzipSync(f.shared[0]);
  const mediaName = Object.keys(entries).find((name) => name.startsWith("media/"));
  entries[mediaName][0] ^= 0xff;
  f.files.set(picked, Buffer.from(fflate.zipSync(entries, { level: 0 })));
  const inspection = await f.api.inspectCompleteBackup(picked);
  await assert.rejects(f.api.restoreCompleteBackup(inspection), /Integrity verification failed/);
  assert.equal([...f.files.keys()].some((uri) => uri.includes("complete-restore-")), false);
  for (const uri of Object.values(f.media)) assert.ok(f.files.has(uri));
});

test("unsupported web and missing Android destination fail explicitly", async () => {
  const web = await fixture("web");
  await assert.rejects(archive(web), /require the Android or iPhone app/);
  const android = await fixture("android");
  await assert.rejects(android.api.createCompleteBackup(null, android.records, [], android.settings), /Choose a folder/);
});

function settingsFixture({ canceled = false, invalid = false, commitFails = false, laterFails = false } = {}) {
  const alerts = [];
  const deleted = [];
  const discarded = [];
  const inspection = { archiveUri: "file:///cache/picked.mrbak", manifest: {
    createdAt: "2026-10-20T10:00:00Z", records: [{ id: "old" }], media: [{}],
  } };
  const staged = { records: [], tags: [], settings: {}, mediaCount: 1, stagingDirectory: "file:///staged/" };
  let busy = false;
  let pickerOptions;
  let savedCount = 0;
  const context = vm.createContext({
    Platform: { OS: "ios" },
    Alert: { alert: (...args) => alerts.push(args) },
    FileSystem: { deleteAsync: async (uri) => { deleted.push(uri); } },
    DocumentPicker: { getDocumentAsync: async (options) => {
      pickerOptions = options;
      return { canceled, assets: canceled ? [] : [{ uri: inspection.archiveUri }] };
    } },
    ensureSnapshotIdle: () => true,
    records: [], knownTags: [], settings: {},
    createCompleteBackup: async () => ({
      filename: "test.mrbak", mediaCount: 0, skippedThumbnailCount: 0, delivery: "shared",
    }),
    markCompleteBackupSuccessful: async () => { savedCount++; },
    setCompleteBackupBusy: (value) => { busy = value; },
    setCompleteBackupOperation() {}, setCompleteBackupProgress() {},
    inspectCompleteBackup: async () => { if (invalid) throw new Error("Invalid ZIP"); return inspection; },
    restoreCompleteBackup: async () => staged,
    discardCompleteRestore: async (value) => { discarded.push(value); },
    importRecords: async () => { if (commitFails) throw new Error("Commit failed"); },
    requireCompleteBackupAfterRestore: async () => { if (laterFails) throw new Error("Reminder failed"); },
    refreshCompleteBackupReminder: async () => {},
    updateSettings: async () => {},
    setVaultName() {}, setFolder() {}, setAuthorName() {},
    Haptics: { notificationAsync: async () => {}, NotificationFeedbackType: { Success: "success" } },
  });
  const source = fs.readFileSync(path.join(__dirname, "../app/(tabs)/settings.tsx"), "utf8");
  const handlers = source.slice(source.indexOf("  const handleCreateCompleteBackup ="), source.indexOf("  const performPreviousDataRecovery ="));
  vm.runInContext(stripTypeScriptTypes(handlers) +
    "\nglobalThis.handlers = { handleCreateCompleteBackup, handleRestoreCompleteBackup, performCompleteRestore };", context);
  return {
    handlers: context.handlers, alerts, deleted, discarded, inspection,
    get busy() { return busy; }, get pickerOptions() { return pickerOptions; },
    get savedCount() { return savedCount; },
  };
}

test("closing the iPhone share sheet never marks a backup saved without user confirmation", async () => {
  const f = settingsFixture();
  await f.handlers.handleCreateCompleteBackup();
  assert.equal(f.savedCount, 0);
  assert.equal(f.alerts[0][0], "Did You Save the Backup?");
  assert.equal(f.alerts[0][2][0].text, "Not Saved");
  f.alerts[0][2][1].onPress();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.savedCount, 1);
});

test("iPhone picker cancellation and invalid archives release busy state and owned cache", async () => {
  for (const options of [{ canceled: true }, { invalid: true }]) {
    const f = settingsFixture(options);
    await f.handlers.handleRestoreCompleteBackup();
    assert.equal(f.pickerOptions.copyToCacheDirectory, true);
    assert.equal(f.busy, false);
    assert.equal(f.deleted.length, options.canceled ? 0 : 1);
  }
});

test("restore confirmation retains cache until cancel and keeps background snapshots blocked", async () => {
  const f = settingsFixture();
  await f.handlers.handleRestoreCompleteBackup();
  assert.equal(f.busy, true);
  assert.equal(f.deleted.length, 0);
  assert.equal(f.alerts[0][0], "Restore Complete Backup?");
  await f.alerts[0][2][0].onPress();
  // The native button invokes a void async cleanup callback.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.busy, false);
  assert.deepEqual(f.deleted, [f.inspection.archiveUri]);
});

test("failed commits discard staged media; failures after commit never discard restored files", async () => {
  for (const options of [{ commitFails: true }, { laterFails: true }, {}]) {
    const f = settingsFixture(options);
    await f.handlers.performCompleteRestore(f.inspection);
    assert.equal(f.discarded.length, options.commitFails ? 1 : 0);
    assert.deepEqual(f.deleted, [f.inspection.archiveUri]);
    assert.equal(f.busy, false);
    assert.equal(f.alerts.at(-1)[0], options.commitFails
      ? "Complete Restore Failed"
      : options.laterFails ? "Restore Completed with a Warning" : "Complete Restore Finished");
  }
});
