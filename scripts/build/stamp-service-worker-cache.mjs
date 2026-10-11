import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const serviceWorkerPath = resolve(projectRoot, "sw.js");

function extractConstString(source, constName) {
  const pattern = new RegExp(`const\\s+${constName}\\s*=\\s*"([^"]+)"`);
  const match = source.match(pattern);
  return match?.[1] || null;
}

function extractConstStringArray(source, constName) {
  const pattern = new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const match = source.match(pattern);
  if (!match) return [];

  return Array.from(match[1].matchAll(/"([^"]*)"/g)).map((item) => item[1] || "");
}

function normalizeAssetPath(asset) {
  const normalized = String(asset || "").trim();
  if (!normalized) return "index.html";
  if (
    normalized.startsWith("data:") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("tel:") ||
    normalized.startsWith("#") ||
    /^https?:\/\//i.test(normalized)
  ) {
    return null;
  }
  return normalized.replace(/^\.\//, "").split("?")[0];
}

const serviceWorkerSource = await readFile(serviceWorkerPath, "utf8");
const manifestUrl = extractConstString(serviceWorkerSource, "MANIFEST_URL");
const assets = [
  manifestUrl,
  ...extractConstStringArray(serviceWorkerSource, "STATIC_PAGES"),
  ...extractConstStringArray(serviceWorkerSource, "STATIC_ASSETS")
]
  .map((asset) => normalizeAssetPath(asset))
  .filter((asset) => !!asset);

// Lazy chunks affect cache invalidation without joining eager installation downloads.
async function runtimeAssets(directory) {
  const entries = await readdir(resolve(projectRoot, directory), { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await runtimeAssets(path));
    else if (entry.isFile() && /\.(js|css|html|wasm)$/.test(entry.name)) result.push(path);
  }
  return result;
}
const stylesheets = (await readdir(projectRoot)).filter(name => name.endsWith(".css"));
const uniqueAssets = Array.from(new Set([...assets, ...stylesheets, ...await runtimeAssets("dist")])).sort();
const hash = createHash("sha256");

for (const asset of uniqueAssets) {
  const assetPath = resolve(projectRoot, asset);
  const content = await readFile(assetPath);
  hash.update(asset);
  hash.update("\0");
  hash.update(content);
  hash.update("\0");
}

const cacheVersion = hash.digest("hex").slice(0, 12);
const cacheName = `tehnadzor-${cacheVersion}`;
const cacheNamePattern = /const CACHE_NAME = "tehnadzor-[^"]+";/;
if (!cacheNamePattern.test(serviceWorkerSource)) {
  throw new Error("Could not find service worker CACHE_NAME");
}

const stampedSource = serviceWorkerSource.replace(
  cacheNamePattern,
  `const CACHE_NAME = "${cacheName}";`
);

await writeFile(serviceWorkerPath, stampedSource, "utf8");
console.log(`Service worker cache stamped: ${cacheName}`);
