import { access, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const publicRoot = resolve(projectRoot, "dist-hosting");

const requiredFiles = [
  "index.html",
  "404.html",
  "manifest.json",
  "sw.js",
  "style.css",
  "liquid-glass.css",
  "dist/app.js",
  "dist/firebase.js",
  "dist/auth.js",
  "dist/profile-feed.json",
  "dist/app/vendor/thatopen-bim-visual-panel.bundle.js",
  "dist/app/vendor/thatopen-fragments-worker.mjs",
  "dist/app/vendor/web-ifc.wasm",
  "dist/app/vendor/ifc-lite_bg.wasm",
  "fonts/Roboto-Regular.ttf",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

const forbiddenPathSegments = new Set([
  "node_modules",
  "scripts",
  "server",
  "src",
  "tests",
  "functions"
]);

const forbiddenFilePatterns = [
  /\.env(?:$|\.)/u,
  /\.map$/u,
  /\.ts$/u,
  /(?:^|[/\\])package(?:-lock)?\.json$/u,
  /(?:^|[/\\])tsconfig(?:\.[^/\\]+)?\.json$/u,
  /(?:^|[/\\])(?:README|SECURITY|CONTRIBUTING)(?:\.[^/\\]+)?\.md$/iu
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(entryPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

const files = await walk(publicRoot);
const missingFiles = [];

for (const file of requiredFiles) {
  try {
    await access(resolve(publicRoot, file));
  } catch {
    missingFiles.push(file);
  }
}

if (missingFiles.length > 0) {
  const formatted = missingFiles.map((file) => `- ${file}`).join("\n");
  throw new Error(`Required files missing from Firebase Hosting output:\n${formatted}`);
}

const violations = files.filter((filePath) => {
  const relativePath = relative(publicRoot, filePath);
  const segments = relativePath.split(sep);
  return segments.some((segment) => forbiddenPathSegments.has(segment)) ||
    forbiddenFilePatterns.some((pattern) => pattern.test(relativePath));
});

if (violations.length > 0) {
  const formatted = violations
    .map((filePath) => `- ${relative(publicRoot, filePath)}`)
    .join("\n");
  throw new Error(`Forbidden files found in Firebase Hosting output:\n${formatted}`);
}

console.log(`Firebase Hosting output verified: ${files.length} files`);
