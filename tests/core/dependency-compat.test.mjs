import test from "node:test";
import assert from "node:assert/strict";
import { readFileFromUrl } from "@redocly/openapi-core";
import { ensureRedoclyCompatibility } from "../../scripts/build/redocly-compat.mjs";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("Redocly preserves URL header glob matching with patched minimatch", async () => {
  await ensureRedoclyCompatibility({ checkOnly: true });
  const headers = [
    { matches: "example.invalid/**", name: "X-Implicit", value: "implicit" },
    { matches: "https://example.invalid/**", name: "X-Explicit", value: "explicit" },
    { matches: "other.invalid/**", name: "X-Excluded", value: "excluded" },
    { matches: "example.invalid/schema.{json,yaml}", name: "X-Braces", value: "braces" }
  ];
  const requests = [];
  const customFetch = async (url, options) => {
    requests.push({ url, headers: options.headers });
    return { ok: true, text: async () => "synthetic schema", headers: { get: () => "application/json" } };
  };
  const result = await readFileFromUrl("https://example.invalid/schema.json", { headers, customFetch });
  assert.deepEqual(result, { body: "synthetic schema", mimeType: "application/json" });
  assert.deepEqual(requests[0].headers, { "X-Implicit": "implicit", "X-Explicit": "explicit", "X-Braces": "braces" });
  await readFileFromUrl("https://example.invalid/schema.json", { headers: [], customFetch });
  assert.deepEqual(requests[1].headers, {});
  process.env.TEHNADZOR_SYNTHETIC_HEADER = "from-env";
  try {
    await readFileFromUrl("https://example.invalid/schema.json", {
      headers: [{ matches: "example.invalid/**", name: "X-Env", value: "ignored", envVariable: "TEHNADZOR_SYNTHETIC_HEADER" }], customFetch
    });
    assert.deepEqual(requests[2].headers, { "X-Env": "from-env" });
  } finally { delete process.env.TEHNADZOR_SYNTHETIC_HEADER; }
  await assert.rejects(readFileFromUrl("https://example.invalid/schema.json", {
    headers, customFetch: async () => ({ ok: false, status: 403, statusText: "Forbidden" })
  }), /Failed to load .*403 Forbidden/);
});

test("Redocly installation adaptation is idempotent and rejects unreviewed source", async () => {
  const root = await mkdtemp(join(tmpdir(), "redocly-compat-"));
  try {
    const scripts = join(root, "scripts/build");
    const vendor = join(root, "node_modules/@redocly/openapi-core");
    await mkdir(scripts, { recursive: true });
    await mkdir(join(vendor, "lib"), { recursive: true });
    await copyFile("scripts/build/redocly-compat.mjs", join(scripts, "redocly-compat.mjs"));
    const metadata = join(vendor, "package.json");
    const file = join(vendor, "lib/utils.js");
    await writeFile(metadata, JSON.stringify({ version: "1.34.20" }));
    const patched = await readFile("node_modules/@redocly/openapi-core/lib/utils.js", "utf8");
    const original = patched.replace('const { minimatch } = require("minimatch");', 'const minimatch = require("minimatch");');
    await writeFile(file, original);
    const run = (...args) => spawnSync(process.execPath, [join(scripts, "redocly-compat.mjs"), ...args], { encoding: "utf8" });
    assert.notEqual(run("--check").status, 0, "skipping lifecycle scripts must be detectable");
    assert.equal(run().status, 0);
    assert.equal(await readFile(file, "utf8"), patched);
    assert.equal(run().status, 0);
    assert.equal(run("--check").status, 0);
    await writeFile(file, patched + "\n// unreviewed change");
    assert.notEqual(run().status, 0);
    await writeFile(file, patched);
    await writeFile(metadata, JSON.stringify({ version: "2.0.0" }));
    assert.notEqual(run().status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
