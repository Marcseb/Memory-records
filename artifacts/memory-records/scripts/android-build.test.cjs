const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { configureGradle, DAEMON_CRITERIA } = require("../plugins/with-local-android-build.cjs");
const { validateConfig, backupNativeProject } = require("./prepare-android.cjs");

test("Gradle customization is idempotent and preserves unrelated configuration", () => {
  const source = "buildscript { /* existing settings */ }\n";
  const first = configureGradle(source);
  assert.equal(configureGradle(first), first);
  assert.ok(first.startsWith(source));
  assert.equal(first.match(/toolchainPlatforms = \[\]/g).length, 1);
});

test("an existing managed block can be refreshed without modifying surrounding text", () => {
  const source = "before\n// @memory-records/local-jdk start\nold\n// @memory-records/local-jdk end\nafter\n";
  const updated = configureGradle(source);
  assert.ok(updated.startsWith("before\n"));
  assert.ok(updated.endsWith("\nafter\n"));
  assert.ok(!updated.includes("\nold\n"));
});

test("incomplete managed blocks fail instead of silently duplicating settings", () => {
  assert.throws(() => configureGradle("// @memory-records/local-jdk start\n"), /incomplete/);
  assert.throws(() => configureGradle("// @memory-records/local-jdk end\n"), /incomplete/);
});

test("daemon criteria use only installed JDK 17 without host-specific paths or downloads", () => {
  assert.match(DAEMON_CRITERIA, /^toolchainVersion=17$/m);
  assert.ok(!DAEMON_CRITERIA.includes("toolchainUrl"));
  assert.ok(!DAEMON_CRITERIA.includes("/home/"));
});

function production() {
  return { version: "1.0.1", android: { package: "app.memoryrecords", versionCode: 2 }, extra: { snapshotTestBuild: false } };
}

test("valid production configuration is accepted", () => {
  assert.doesNotThrow(() => validateConfig(production()));
});

test("test identities and enabled harnesses are rejected", () => {
  const wrongId = production();
  wrongId.android.package += ".snapshottest";
  assert.throws(() => validateConfig(wrongId), /test harness disabled/);
  const testHarness = production();
  testHarness.extra.snapshotTestBuild = true;
  assert.throws(() => validateConfig(testHarness), /test harness disabled/);
});

test("release version code must be a positive integer", () => {
  for (const value of [0, -1, 1.5, "2", undefined]) {
    const config = production();
    config.android.versionCode = value;
    assert.throws(() => validateConfig(config), /positive integer/);
  }
});

test("release version must be explicit", () => {
  const config = production();
  config.version = "";
  assert.throws(() => validateConfig(config), /release version/);
});

test("native backup preserves source and configuration but skips build caches", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-records-build-test-"));
  try {
    fs.mkdirSync(path.join(root, "android/app/src"), { recursive: true });
    fs.mkdirSync(path.join(root, "android/app/build"), { recursive: true });
    fs.writeFileSync(path.join(root, "android/app/src/custom.txt"), "native source");
    fs.writeFileSync(path.join(root, "android/build.gradle"), "custom configuration");
    fs.writeFileSync(path.join(root, "android/app/build/cache.txt"), "cache");
    const backup = backupNativeProject(root);
    assert.equal(fs.readFileSync(path.join(backup, "app/src/custom.txt"), "utf8"), "native source");
    assert.equal(fs.readFileSync(path.join(backup, "build.gradle"), "utf8"), "custom configuration");
    assert.ok(!fs.existsSync(path.join(backup, "app/build")));
    assert.ok(fs.existsSync(path.join(root, "android/app/src/custom.txt")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("private keystores prevent native regeneration without moving or reading the key", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-records-build-test-"));
  try {
    fs.mkdirSync(path.join(root, "android/app"), { recursive: true });
    const key = path.join(root, "android/app/private.jks");
    fs.writeFileSync(key, "dummy test fixture, not a key");
    assert.throws(() => backupNativeProject(root), /Move private signing keystores/);
    assert.ok(fs.existsSync(key));
    assert.ok(!fs.existsSync(path.join(root, ".android-prebuild-backups")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a fresh project does not need a native backup", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-records-build-test-"));
  try {
    assert.equal(backupNativeProject(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
