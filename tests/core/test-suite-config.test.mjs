import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

for (const failure of [false, true]) {
  test(`npm test restores local login configuration after ${failure ? "failure" : "success"}`, async () => {
    const root = await mkdtemp(resolve(tmpdir(), "auth-suite-"));
    try {
      await mkdir(resolve(root, "scripts/build"), { recursive: true });
      await mkdir(resolve(root, "scripts/checks"), { recursive: true });
      await mkdir(resolve(root, "dist"));
      for (const file of ["scripts/build/inject-firebase-config.mjs", "scripts/build/stamp-service-worker-cache.mjs", "scripts/checks/run-test-suite.mjs"]) {
        if (existsSync(file)) await copyFile(file, resolve(root, file));
      }
      const source = JSON.parse(await readFile("package.json", "utf8"));
      await writeFile(resolve(root, "package.json"), JSON.stringify({ type: "module", scripts: {
        test: source.scripts.test, "test:smoke": "node fixture.mjs", "test:core": "node -e \"\"", "test:ui": "node -e \"\""
      } }));
      await writeFile(resolve(root, "fixture.mjs"), `import { writeFileSync } from 'node:fs'; writeFileSync('dist/firebase.js','const config = { apiKey: "demo-api-key" };'); process.exit(${failure ? 2 : 0});`);
      await writeFile(resolve(root, "sw.js"), 'const CACHE_NAME = "tehnadzor-original"; const STATIC_PAGES = []; const STATIC_ASSETS = [];');
      await writeFile(resolve(root, "index.html"), "<!doctype html><title>Synthetic login fixture</title>");
      await writeFile(resolve(root, ".env"), [
        "FIREBASE_WEB_API_KEY=synthetic-local-key", "FIREBASE_WEB_PROJECT_ID=synthetic-local-project",
        "FIREBASE_WEB_AUTH_DOMAIN=synthetic-local.firebaseapp.com", "FIREBASE_WEB_STORAGE_BUCKET=synthetic-local.appspot.com",
        "FIREBASE_WEB_MESSAGING_SENDER_ID=123456789", "FIREBASE_WEB_APP_ID=1:123456789:web:synthetic-local"
      ].join("\n"));
      const result = spawnSync(process.execPath, [process.env.npm_execpath, "test"], {
        cwd: root, encoding: "utf8", env: { ...process.env, FIREBASE_CONFIG_MODE: "test", FIREBASE_WEB_API_KEY: "demo-api-key", FIREBASE_WEB_PROJECT_ID: "demo-project" }
      });
      assert.equal(result.status, failure ? 2 : 0, result.stderr);
      assert.match(await readFile(resolve(root, "dist/firebase.js"), "utf8"), /synthetic-local-key/);
      assert.doesNotMatch(await readFile(resolve(root, "sw.js"), "utf8"), /tehnadzor-original/);
    } finally {
      assert.ok(root.startsWith(resolve(tmpdir()) + sep + "auth-suite-"));
      await rm(root, { recursive: true, force: true });
    }
  });
}
