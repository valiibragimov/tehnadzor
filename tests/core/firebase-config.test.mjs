import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

async function inject(mode, { local = false, reinject = false } = {}) {
  const root = await mkdtemp(resolve(tmpdir(), "firebase-config-"));
  try {
    await mkdir(resolve(root, "scripts/build"), { recursive: true });
    await mkdir(resolve(root, "dist"));
    await copyFile("scripts/build/inject-firebase-config.mjs", resolve(root, "scripts/build/inject-firebase-config.mjs"));
    await writeFile(resolve(root, "dist/firebase.js"), `const config = {
      apiKey: "__FIREBASE_WEB_API_KEY__", authDomain: "__FIREBASE_WEB_AUTH_DOMAIN__",
      projectId: "__FIREBASE_WEB_PROJECT_ID__", storageBucket: "__FIREBASE_WEB_STORAGE_BUCKET__",
      messagingSenderId: "__FIREBASE_WEB_MESSAGING_SENDER_ID__", appId: "__FIREBASE_WEB_APP_ID__"
    };`);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("FIREBASE_")));
    Object.assign(env, {
      FIREBASE_WEB_API_KEY: "demo-api-key", FIREBASE_WEB_PROJECT_ID: "demo-project",
      FIREBASE_WEB_AUTH_DOMAIN: "demo.firebaseapp.com", FIREBASE_WEB_STORAGE_BUCKET: "demo.appspot.com",
      FIREBASE_WEB_MESSAGING_SENDER_ID: "000000000000", FIREBASE_WEB_APP_ID: "1:000000000000:web:demo"
    });
    if (mode) env.FIREBASE_CONFIG_MODE = mode;
    if (local) await writeFile(resolve(root, ".env"), Object.entries({
      FIREBASE_WEB_API_KEY: "synthetic-local-key", FIREBASE_WEB_PROJECT_ID: "synthetic-local-project",
      FIREBASE_WEB_AUTH_DOMAIN: "synthetic-local.firebaseapp.com", FIREBASE_WEB_STORAGE_BUCKET: "synthetic-local.appspot.com",
      FIREBASE_WEB_MESSAGING_SENDER_ID: "123456789", FIREBASE_WEB_APP_ID: "1:123456789:web:synthetic-local"
    }).map(([key, value]) => `${key}=${value}`).join("\n"));
    let result = spawnSync(process.execPath, [resolve(root, "scripts/build/inject-firebase-config.mjs")], { env, encoding: "utf8" });
    if (reinject) result = spawnSync(process.execPath, [resolve(root, "scripts/build/inject-firebase-config.mjs"), "--restore-local"], { env, encoding: "utf8" });
    return { status: result.status, error: result.stderr, output: await readFile(resolve(root, "dist/firebase.js"), "utf8") };
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("normal client build rejects the demo key before writing the login runtime", async () => {
  const result = await inject();
  assert.notEqual(result.status, 0, "demo-api-key must not enter a normal login runtime");
  assert.match(result.error, /Placeholder Firebase web config/);
  assert.equal(result.error.includes("demo-api-key"), false);
  assert.equal(result.output.includes("__FIREBASE_WEB_API_KEY__"), true);
});

test("isolated CI fixtures require an explicit test configuration mode", async () => {
  const result = await inject("test");
  assert.equal(result.status, 0);
  assert.equal(result.output.includes("__FIREBASE_WEB_API_KEY__"), false);
});

test("restoring a local login runtime replaces CI config with the existing local config", async () => {
  const result = await inject("test", { local: true, reinject: true });
  assert.equal(result.status, 0);
  assert.match(result.output, /synthetic-local-key/);
  assert.equal(result.output.includes("demo-api-key"), false);
  assert.match(result.output, /synthetic-local\.firebaseapp\.com/);
  assert.match(result.output, /projectId: "synthetic-local-project"/);
  assert.match(result.output, /synthetic-local\.appspot\.com/);
  assert.match(result.output, /messagingSenderId: "123456789"/);
  assert.match(result.output, /1:123456789:web:synthetic-local/);
});

test("CI without a local configuration retains its isolated synthetic runtime", async () => {
  const result = await inject("test", { reinject: true });
  assert.equal(result.status, 0);
  assert.match(result.output, /demo-api-key/);
});
