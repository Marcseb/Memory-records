const base = require("./app.json").expo;

const snapshotTestBuild = process.env.APP_VARIANT === "snapshot-test";

module.exports = {
  expo: {
    ...base,
    name: snapshotTestBuild ? "Memory Records Snapshot Test" : base.name,
    scheme: snapshotTestBuild ? "memory-records-snapshot-test" : base.scheme,
    android: {
      ...base.android,
      ...(snapshotTestBuild
        ? { package: "app.memoryrecords.snapshottest" }
        : {}),
    },
    ios: {
      ...base.ios,
      ...(snapshotTestBuild
        ? { bundleIdentifier: "app.memoryrecords.snapshottest" }
        : {}),
    },
    extra: {
      ...(base.extra ?? {}),
      eas: {
        ...(base.extra?.eas ?? {}),
        projectId: "8e6c0f43-d783-4cd9-9052-5806f1f4e2d0",
      },
      snapshotTestBuild,
    },
  },
};