const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function load(file, mocks = {}) {
  const compiled = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (name) => name in mocks ? mocks[name] : name === "react" ? require("react") : {};
  new Function("require", "module", "exports", compiled)(localRequire, module, module.exports);
  return module.exports;
}

test("free identity and production mode cannot be overridden by APP_VARIANT", () => {
  const old = process.env.APP_VARIANT;
  try {
    process.env.APP_VARIANT = "snapshot-test";
    const config = require("../app.config.js").expo;
    assert.equal(config.android.package, "app.memoryrecords.free");
    assert.equal(config.scheme, "memory-records-free");
    assert.equal(config.extra.snapshotTestBuild, false);
    assert.equal(config.extra.edition, "google-play-free");
    assert.equal(config.android.versionCode, 1);
    assert.equal(load("constants/edition.ts").PRO_FEATURES_ENABLED, false);
  } finally {
    if (old === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = old;
  }
});

test("the active entitlement provider never reads cache, identity, or payment services", async () => {
  const forbidden = () => { throw new Error("Pro dependency was called"); };
  const context = load("context/UnlockContext.tsx", {
    "./AuthContext": { useAuth: forbidden },
    "@/utils/secureStorage": { getSecureItem: forbidden, setSecureItem: forbidden, deleteSecureItem: forbidden },
  });
  const value = context.UnlockProvider({ children: null }).props.value;
  assert.equal(value.isPremiumUnlocked, false);
  await value.checkStatus();
  assert.equal((await value.checkPayment("someone@example.invalid")).ok, false);
  assert.equal((await value.activateCode("ANY-CODE")).ok, false);
  assert.equal(value.isPremiumUnlocked, false);
});

test("payment and voice components render nothing even if directly mounted", () => {
  assert.equal(load("components/UnlockModal.tsx").UnlockModal({ visible: true }), null);
  assert.equal(load("components/VoiceMemoRecorder.tsx").VoiceMemoRecorder({}), null);
  assert.equal(load("components/VoiceMemoPlayer.tsx").VoiceMemoPlayer({ uri: "restored-audio" }), null);
});

test("restored vault settings cannot enable single or bulk Obsidian export", async () => {
  const obsidian = load("hooks/useObsidian.ts", {
    "@/constants/edition": { PRO_FEATURES_ENABLED: false },
    "@/context/SettingsContext": { useSettings: () => ({ settings: { configured: true, vaultName: "RestoredVault" } }) },
    "@/context/RecordsContext": { useRecords: () => ({ records: [] }) },
  });
  assert.throws(() => obsidian.buildAllExportData([]), /unavailable/);
  assert.equal((await obsidian.useObsidian().saveToObsidian({})).ok, false);
  assert.equal((await obsidian.useObsidian().exportAllToObsidian()).exported, 0);
});

test("the shared import path rejects Markdown but keeps JSON imports working", async () => {
  const source = ts.createSourceFile("settings.tsx", read("app/(tabs)/settings.tsx"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "processImportText") initializer = node.initializer.getText(source);
    ts.forEachChild(node, walk);
  }
  walk(source);
  assert.ok(initializer);
  const output = ts.transpileModule(`const processImportText = ${initializer};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  let imported = null;
  const execute = new Function("PRO_FEATURES_ENABLED", "isObsidianMarkdown", "parseMultipleObsidianNotes", "parseObsidianNote", "importRecords", "Platform", "Haptics", output + "; return processImportText;");
  const forbidden = () => { throw new Error("Markdown parser was called"); };
  const processImportText = execute(false, (text) => text.startsWith("---"), forbidden, forbidden, async (records) => { imported = records; }, { OS: "web" }, {});
  await assert.rejects(processImportText("---\n**Date:** today\n## Note"), /not available/);
  assert.equal(imported, null);
  assert.equal(await processImportText(JSON.stringify({ records: [{ id: "one", note: "A core memory" }], tags: [] })), 1);
  assert.equal(imported[0].note, "A core memory");
});

test("free Help routes only to core documentation, not donation or payment pages", () => {
  assert.match(read("app/help.tsx"), /export \{ default \} from "@\/components\/CoreHelp"/);
  assert.doesNotMatch(read("components/CoreHelp.tsx"), /paypal\.com|buymeacoffee\.com|\/api\/unlock/);
  assert.match(read("components/CoreHelp.tsx"), /tree\/google-play-free/);
});
