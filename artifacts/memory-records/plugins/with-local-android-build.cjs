const fs = require("node:fs/promises");
const path = require("node:path");
const { withProjectBuildGradle, withDangerousMod } = require("expo/config-plugins");

const START = "// @memory-records/local-jdk start";
const END = "// @memory-records/local-jdk end";
const DAEMON_CRITERIA =
  "# Memory Records: use an installed JDK 17, without automatic downloads.\n" +
  "toolchainVersion=17\n";
const GRADLE_BLOCK = `${START}
tasks.matching { it.name == "updateDaemonJvm" }.configureEach {
    toolchainPlatforms = []
}
${END}`;

function configureGradle(contents) {
  const start = contents.indexOf(START);
  const end = contents.indexOf(END);
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) {
    throw new Error("The managed local-JDK block is incomplete. Repair it before prebuild.");
  }
  if (start >= 0) {
    return contents.slice(0, start) + GRADLE_BLOCK + contents.slice(end + END.length);
  }
  return `${contents.trimEnd()}\n\n${GRADLE_BLOCK}\n`;
}

function withLocalAndroidBuild(config) {
  config = withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== "groovy") {
      throw new Error("Memory Records local Android setup currently requires a Groovy build.gradle.");
    }
    mod.modResults.contents = configureGradle(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const gradleDir = path.join(mod.modRequest.platformProjectRoot, "gradle");
      await fs.mkdir(gradleDir, { recursive: true });
      await fs.writeFile(path.join(gradleDir, "gradle-daemon-jvm.properties"), DAEMON_CRITERIA);
      return mod;
    },
  ]);
}

module.exports = withLocalAndroidBuild;
module.exports.configureGradle = configureGradle;
module.exports.DAEMON_CRITERIA = DAEMON_CRITERIA;
