// Explicit, temporary compatibility patch. See docs/dependency-audit.md.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const target = new URL("node_modules/@redocly/openapi-core/lib/utils.js", root);
const originalHash = "896a9acce92e3e5905aa267e895985d57888a87f500d58c29da9c8f9d488ff1c";
const oldImport = 'const minimatch = require("minimatch");';
const newImport = 'const { minimatch } = require("minimatch");';
const hash = source => createHash("sha256").update(source).digest("hex");

export async function ensureRedoclyCompatibility({ checkOnly = false } = {}) {
  const metadata = JSON.parse(await readFile(new URL("node_modules/@redocly/openapi-core/package.json", root), "utf8"));
  const source = await readFile(target, "utf8");
  // Recover the pristine source only from the one permitted, idempotent edit.
  const original = source.includes(newImport) ? source.replace(newImport, oldImport) : source;
  if (metadata.version !== "1.34.20" || hash(original) !== originalHash) {
    throw new Error("Redocly compatibility patch source/version changed; review upstream before updating the patch.");
  }
  if (source !== original) return;
  if (checkOnly) throw new Error("Redocly compatibility patch missing; run npm ci with lifecycle scripts enabled.");
  await writeFile(target, original.replace(oldImport, newImport));
  console.log("[dependencies] Applied reviewed Redocly 1.34.20 named minimatch import compatibility patch.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await ensureRedoclyCompatibility({ checkOnly: process.argv.includes("--check") });
}
