import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const targets = [
  "dist",
  "server/dist",
  "functions/dist",
  "app",
  "app.js",
  "auth.js",
  "config.js",
  "firebase.js",
  "geom.js",
  "journal.js",
  "liquid-glass.js",
  "profile-feed.json",
  "reinf.js",
  "summary.js",
  "sw.js",
  "utils.js",
  "types/domain.js",
  "types/module-records.js",
  "server/index.js",
  "server/scripts",
  "server/services",
  "server/types",
  "functions/index.js",
  "functions/services",
  "functions/types",
  "tmp-chrome-head-home",
  "tmp-chrome-head-profile",
  "tmp-chrome-home-footer",
  "tmp-chrome-index-eq",
  "tmp-chrome-index-wide",
  "tmp-chrome-preview",
  "tmp-chrome-preview-2",
  "tmp-chrome-probe",
  "tmp-chrome-probe-2",
  "tmp-chrome-probe-3",
  "tmp-chrome-prof-eq",
  "tmp-chrome-profile",
  "tmp-chrome-profile-cols",
  "tmp-chrome-profile-wide"
];

for (const relativePath of targets) {
  await rm(resolve(projectRoot, relativePath), {
    recursive: true,
    force: true
  });
}

console.log("Removed legacy runtime artifacts.");
