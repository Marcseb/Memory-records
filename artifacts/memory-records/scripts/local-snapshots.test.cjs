const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { createHash } = require("node:crypto");

const ROOT = "file:///test/";
const SNAPSHOTS = `${ROOT}local-snapshots/`;
const MEDIA = `${SNAPSHOTS}media/`;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function loadTypeScript(file, mocks = {}) {
  const context = vm.createContext({
    console: { info() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Uint8Array, TextEncoder, TextDecoder,
  });
  const source = stripTypeScriptTypes(fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
    const values = mocks[name];
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

async function fixture({ shared = true, corrupt = false } = {}) {
  const files = new Map();
  const reads = new Map();
  const deleted = [];
  const text = (uri, value) => files.set(uri, Buffer.from(JSON.stringify(value)));
  const addSnapshot = (id, date, payload) => {
    const bytes = Buffer.from(payload);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const uri = `${MEDIA}${hash}.blob`;
    files.set(uri, corrupt ? Buffer.from("corrupted!!") : bytes);
    const records = [{ id: "memory-1", note: "A memory", imageUri: `snapshot-media://${hash}` }];
    const fingerprint = JSON.stringify({
      records: [{ ...records[0], imageUri: `${ROOT}photo.jpg` }], tags: [], settings: {},
    });
    text(`${SNAPSHOTS}${id}.json`, {
      format: "memory-records-local-snapshot", version: 2, id, createdAt: date,
      fingerprint, records, tags: [], settings: {},
      media: [{
        recordId: "memory-1", field: "imageUri", ref: `snapshot-media://${hash}`,
        sha256: hash, crc32: crc32(bytes), size: bytes.length, extension: "jpg",
      }],
    });
    return { uri, records, fingerprint };
  };
  const old = addSnapshot("snapshot-old", "2026-10-18T10:00:00.000Z", "hello media");
  const newest = addSnapshot("snapshot-new", "2026-10-19T10:00:00.000Z", shared ? "hello media" : "other media");
  text(`${SNAPSHOTS}index.json`, {
    snapshots: [
      { id: "snapshot-old", createdAt: "2026-10-18T10:00:00.000Z" },
      { id: "snapshot-new", createdAt: "2026-10-19T10:00:00.000Z" },
    ],
    lastSuccessId: "snapshot-new", lastSuccessAt: "2026-10-19T10:00:00.000Z",
  });

  class File {
    constructor(uri) { this.uri = typeof uri === "string" ? uri : uri.uri; }
    create() { files.set(this.uri, Buffer.alloc(0)); }
    write(value) { files.set(this.uri, Buffer.from(value)); }
    async text() { return files.get(this.uri).toString(); }
    async move(destination) {
      files.set(destination.uri, files.get(this.uri));
      files.delete(this.uri);
      this.uri = destination.uri;
    }
    open() {
      const uri = this.uri;
      if (!files.has(uri)) throw new Error(`Missing file ${uri}`);
      return {
        offset: 0,
        size: files.get(uri).length,
        readBytes(length) {
          reads.set(uri, (reads.get(uri) || 0) + 1);
          return new Uint8Array(files.get(uri).subarray(this.offset, this.offset + length));
        },
        close() {},
      };
    }
  }
  const legacy = {
    documentDirectory: ROOT, cacheDirectory: "file:///cache/",
    async getInfoAsync(uri) { return { exists: files.has(uri), isDirectory: false }; },
    async readAsStringAsync(uri) {
      if (!files.has(uri)) throw new Error("Missing metadata");
      return files.get(uri).toString();
    },
    async makeDirectoryAsync() {},
    async readDirectoryAsync(uri) {
      return [...files.keys()].filter((key) => key.startsWith(uri) && !key.slice(uri.length).includes("/"))
        .map((key) => key.slice(uri.length));
    },
    async deleteAsync(uri) { deleted.push(uri); files.delete(uri); },
  };
  const api = await loadTypeScript("utils/localSnapshots.ts", {
    "expo-file-system": { File, FileMode: { ReadOnly: "r", Append: "a" } },
    "expo-file-system/legacy": legacy,
    "expo/fetch": { fetch: async () => { throw new Error("Unexpected fetch"); } },
    "expo-image": { Image: { getCachePathAsync: async () => null } },
    "expo-constants": { default: { expoConfig: { extra: {} } } },
  });
  return { api, files, reads, deleted, old, newest, index: () => JSON.parse(files.get(`${SNAPSHOTS}index.json`)) };
}

test("idle scheduling requires two quiet foreground minutes and resets after activity", async () => {
  const api = await loadTypeScript("utils/snapshotScheduling.ts");
  const state = {
    eligible: true, foreground: true, ready: true, blocked: false,
    automaticEnabled: true, running: false, lastActivityAt: 1000,
  };
  assert.equal(api.snapshotIdleDelay(state, 1000), 120000);
  assert.equal(api.snapshotIdleDelay(state, 61000), 60000);
  assert.equal(api.snapshotIdleDelay(state, 121000), 0);
  assert.equal(api.snapshotIdleDelay({ ...state, lastActivityAt: 61000 }, 61000), 120000);
  for (const key of ["eligible", "foreground", "ready", "automaticEnabled"]) {
    assert.equal(api.snapshotIdleDelay({ ...state, [key]: false }, 121000), null);
  }
  for (const key of ["blocked", "running"]) {
    assert.equal(api.snapshotIdleDelay({ ...state, [key]: true }, 121000), null);
  }
  assert.equal(api.isSnapshotHomeRoute(["(tabs)"]), true);
  for (const route of [["new-record"], ["record", "[id]"], ["(tabs)", "settings"], ["help"]]) {
    assert.equal(api.isSnapshotHomeRoute(route), false);
  }
});

test("deletion hashes shared media once and preserves the retained snapshot", async () => {
  const f = await fixture();
  const progress = [];
  await f.api.deleteLocalSnapshot("snapshot-old", (value) => progress.push(value));
  assert.equal(f.reads.get(f.old.uri), 1);
  assert.equal(f.files.has(f.old.uri), true);
  assert.equal(f.files.has(`${SNAPSHOTS}snapshot-new.json`), true);
  assert.equal(f.files.has(`${SNAPSHOTS}snapshot-old.json`), false);
  assert.equal(f.index().snapshots.length, 1);
  assert.ok(progress.some((value) => value.unit === "bytes"));
});

test("the newest verified snapshot cannot be deleted", async () => {
  const f = await fixture();
  await assert.rejects(f.api.deleteLocalSnapshot("snapshot-new"), /newest verified snapshot is protected/);
  assert.equal(f.files.has(`${SNAPSHOTS}snapshot-new.json`), true);
  assert.equal(f.index().snapshots.length, 2);
});

test("uncertain media inventory blocks cleanup and preserves non-target files", async () => {
  const f = await fixture({ corrupt: true });
  await f.api.deleteLocalSnapshot("snapshot-old");
  assert.equal(f.index().cleanupBlocked, true);
  assert.equal(f.files.has(`${SNAPSHOTS}snapshot-new.json`), true);
  assert.equal(f.files.has(f.newest.uri), true);
  assert.equal(f.deleted.some((uri) => uri.endsWith(".blob")), false);
});

test("unreferenced media is removed only after complete verified inventory", async () => {
  const f = await fixture({ shared: false });
  await f.api.deleteLocalSnapshot("snapshot-old");
  assert.equal(f.files.has(f.old.uri), false);
  assert.equal(f.files.has(f.newest.uri), true);
  assert.equal(f.index().cleanupBlocked, undefined);
});

test("a previously blocked cleanup remains blocked after a successful inventory", async () => {
  const f = await fixture({ shared: false });
  f.files.set(`${SNAPSHOTS}index.json`, Buffer.from(JSON.stringify({ ...f.index(), cleanupBlocked: true })));
  await f.api.deleteLocalSnapshot("snapshot-old");
  assert.equal(f.index().cleanupBlocked, true);
  assert.equal(f.files.has(f.old.uri), true);
  assert.equal(f.files.has(f.newest.uri), true);
});

test("unchanged-data checks do not read media bytes", async () => {
  const f = await fixture();
  const records = [{ id: "memory-1", note: "A memory", imageUri: `${ROOT}photo.jpg` }];
  await f.api.maybeCreateAutomaticSnapshot(records, [], {});
  assert.equal([...f.reads.values()].reduce((sum, value) => sum + value, 0), 0);
  assert.equal(f.index().snapshots.length, 2);
});

test("manual verified snapshots update daily completion only after success", async () => {
  const f = await fixture();
  const result = await f.api.createLocalSnapshot([{ id: "new-memory", note: "New text" }], [], {});
  const index = f.index();
  assert.equal(index.lastSuccessId, result.id);
  assert.equal(typeof index.lastCompletedDate, "string");
  assert.equal(index.lastCompletedDate, index.lastAttemptDate);
  assert.equal(f.files.has(`${SNAPSHOTS}${result.id}.json`), true);
});

test("failed manual snapshots do not mark the day complete or remove existing restore points", async () => {
  const f = await fixture();
  await assert.rejects(
    f.api.createLocalSnapshot([{ id: "unreadable-memory", note: "Photo", imageUri: `${ROOT}missing.jpg` }], [], {}),
    /Cannot read imageUri/,
  );
  assert.equal(f.index().lastCompletedDate, undefined);
  assert.equal(f.index().snapshots.length, 2);
  assert.equal(f.files.has(f.old.uri), true);
  assert.equal(f.files.has(f.newest.uri), true);
});
