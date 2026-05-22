import { readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const publicRoot = resolve(projectRoot, "dist-hosting");

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
