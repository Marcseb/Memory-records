const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const APP_ROOT = path.resolve(__dirname, "..");
const PRODUCTION_ID = "app.memoryrecords.free";

function backupNativeProject(appRoot) {
  const nativeRoot = path.join(appRoot, "android");
  if (!fs.existsSync(nativeRoot)) return null;
  const keys = [];
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) inspect(full);
      else if (/\.(jks|keystore)$/i.test(entry.name) &&
        path.relative(nativeRoot, full) !== path.join("app", "debug.keystore")) {
        keys.push(path.relative(nativeRoot, full));
      }
    }
  }
  inspect(nativeRoot);
  if (keys.length) {
    throw new Error(
      `Move private signing keystores outside the android folder before preparation: ${keys.join(", ")}`,
    );
  }
  const backupRoot = path.join(appRoot, ".android-prebuild-backups");
  fs.mkdirSync(backupRoot, { recursive: true });
  const destination = fs.mkdtempSync(path.join(backupRoot, "android-"));
  const cacheDirs = new Set(["build", ".gradle", ".cxx", ".idea"]);
  fs.cpSync(nativeRoot, destination, {
    recursive: true,
    filter: (source) => !(fs.statSync(source).isDirectory() && cacheDirs.has(path.basename(source))),
  });
  return destination;
}

function validateConfig(config) {
  if (config.android?.package !== PRODUCTION_ID || config.extra?.snapshotTestBuild !== false) {
    throw new Error("Free production preparation requires app.memoryrecords.free with the test harness disabled.");
  }
  if (!Number.isInteger(config.android.versionCode) || config.android.versionCode < 1) {
    throw new Error("Set expo.android.versionCode to a positive integer in app.json.");
  }
  if (!/^\d+\.\d+\.\d+$/.test(config.version || "")) {
    throw new Error("Set expo.version to a release version such as 1.0.1 in app.json.");
  }
}

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.some((arg) => arg !== "--check")) {
    throw new Error("Supported option: --check. Native regeneration is backed up automatically.");
  }
  // Explicitly set this before loading config AND launching Expo. Unsetting alone
  // would allow a downloaded .env file to re-enable the Snapshot Test variant.
  process.env.APP_VARIANT = "production";
  const config = require("../app.config.js").expo;
  validateConfig(config);
  console.log(`Production: ${PRODUCTION_ID}, version ${config.version}, code ${config.android.versionCode}`);
  console.log("Snapshot Test harness: disabled. Gradle daemon: local JDK 17.");
  if (args.includes("--check")) return;

  const backup = backupNativeProject(APP_ROOT);
  if (backup) console.log(`Native source/configuration backed up to ${backup} (build caches excluded).`);
  console.log("Regenerating the Android folder from Expo configuration. External signing keys are unchanged.");
  const result = spawnSync(
    process.execPath,
    [require.resolve("expo/bin/cli"), "prebuild", "--platform", "android", "--clean", "--no-install"],
    { cwd: APP_ROOT, stdio: "inherit", env: { ...process.env, CI: "1", APP_VARIANT: "production" } },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Expo prebuild failed (${result.status ?? result.signal}). Android is not ready for signing.`);
  }

  const buildFile = fs.readFileSync(path.join(APP_ROOT, "android/app/build.gradle"), "utf8");
  if (!/applicationId\s+['"]app\.memoryrecords\.free['"]/.test(buildFile)) {
    throw new Error("Generated Android package is not app.memoryrecords.free. Do not sign this build.");
  }
  const code = buildFile.match(/\bversionCode\s+(\d+)/);
  const version = buildFile.match(/\bversionName\s+['"]([^'"]+)['"]/);
  if (Number(code?.[1]) !== config.android.versionCode || version?.[1] !== config.version) {
    throw new Error("Generated Android version does not match app.json. Do not sign this build.");
  }
  const criteria = fs.readFileSync(path.join(APP_ROOT, "android/gradle/gradle-daemon-jvm.properties"), "utf8");
  if (!/^toolchainVersion=17$/m.test(criteria) || /^toolchainUrl\./m.test(criteria)) {
    throw new Error("Local JDK 17 configuration was not generated correctly.");
  }
  console.log("\nAndroid preparation complete. Open artifacts/memory-records/android in Android Studio.");
  console.log("Use installed JDK 17, sync, then generate a release APK with your EXISTING signing keystore.");
  console.log("Before an update: raise versionCode above the installed version and export a complete backup.");
}

module.exports = { validateConfig, backupNativeProject };
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Android preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
