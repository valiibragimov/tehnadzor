import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let status = 0;
try {
  for (const script of ["test:smoke", "test:core", "test:ui"]) {
    const result = spawnSync(process.execPath, [process.env.npm_execpath, "run", script], { cwd: projectRoot, stdio: "inherit" });
    if (result.error || result.status !== 0) {
      status = result.status || 1;
      break;
    }
  }
} finally {
  // CI has no local .env. A developer may run the same synthetic checks while
  // serving login.html from this checkout; restore that login even on failure.
  if (process.env.FIREBASE_CONFIG_MODE === "test" && existsSync(resolve(projectRoot, ".env"))) {
    for (const args of [
      ["scripts/build/inject-firebase-config.mjs", "--restore-local"],
      ["scripts/build/stamp-service-worker-cache.mjs"]
    ]) {
      const result = spawnSync(process.execPath, args, { cwd: projectRoot, stdio: "inherit" });
      if (result.error || result.status !== 0) {
        console.error("[tests] Could not restore the local login runtime. Run npm run build:client with the local configuration.");
        status ||= 1;
        break;
      }
    }
  }
}
process.exitCode = status;
