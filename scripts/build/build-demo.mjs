import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { readIndexHtmlSource } from "./index-html-source.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const sourceRoot = resolve(projectRoot, "src", "client", "demo");
const outputRoot = resolve(projectRoot, "dist-demo");

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

await build({
  entryPoints: [resolve(sourceRoot, "index.ts")],
  outfile: resolve(outputRoot, "demo.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  charset: "utf8"
});

await build({
  entryPoints: [resolve(sourceRoot, "public-api.ts")],
  outfile: resolve(outputRoot, "demo-core.js"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  charset: "utf8"
});

const productionHtml = await readIndexHtmlSource(projectRoot);
const demoHtml = productionHtml
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/\s+on(?:click|keydown|error)="[^"]*"/gi, "")
  .replace(/<link[^>]+(?:manifest|icon|preconnect|fonts\.googleapis|fonts\.gstatic|analytics-block)[^>]*>\s*/gi, "")
  .replace(/<title>[\s\S]*?<\/title>/i, "<title>Интерактивная демонстрация Tehnadzor</title>")
  .replace(/<html lang="ru">/i, '<html lang="ru" class="theme-dark">')
  .replace(/<body class="home-page">/i, '<body class="home-page theme-dark demo-production-ui">')
  .replace(
    /<meta name="viewport"([^>]+)>/i,
    `<meta name="viewport"$1>\n  <meta name="robots" content="noindex,nofollow">\n  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'">`
  )
  .replace(/<link rel="stylesheet" href="style\.css\?v=\d+"\s*\/?>/i, '<link rel="stylesheet" href="./style.css">\n  <link rel="stylesheet" href="./demo.css">')
  .replace(/<link rel="stylesheet" href="liquid-glass\.css\?v=\d+"\s*\/?>/i, '<link rel="stylesheet" href="./liquid-glass.css">')
  .replace(
    /<div class="header-actions">/i,
    '<div class="header-actions"><span class="demo-production-badge" title="Все данные синтетические и сохраняются только в браузере">Демо</span>'
  )
  .replace(/<\/body>/i, '  <script type="module" src="./demo.js"></script>\n</body>');

await writeFile(resolve(outputRoot, "demo.html"), demoHtml, "utf8");
await cp(resolve(projectRoot, "style.css"), resolve(outputRoot, "style.css"));
await cp(resolve(projectRoot, "liquid-glass.css"), resolve(outputRoot, "liquid-glass.css"));
await cp(resolve(sourceRoot, "demo.css"), resolve(outputRoot, "demo.css"));

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath));
    else files.push(absolutePath);
  }
  return files;
}

const outputFiles = await listFiles(outputRoot);
const forbiddenExtensions = new Set([".map", ".ts", ".ifc"]);
const forbiddenNames = new Set([
  ".firebaserc",
  "firebase.json",
  "firestore.rules",
  "firestore.indexes.json"
]);
const forbiddenMarkers = [
  "apiKey",
  "firebaseConfig",
  "tehnadzor-online",
  "projectId",
  "private_key",
  "client_secret",
  "serviceAccount",
  "BEGIN PRIVATE KEY",
  "Building-Architecture",
  "C:\\Users\\"
];

for (const filePath of outputFiles) {
  const fileName = filePath.split(/[\\/]/).pop() || "";
  if (forbiddenExtensions.has(extname(filePath)) || forbiddenNames.has(fileName)) {
    throw new Error(`Forbidden demo artifact: ${relative(outputRoot, filePath)}`);
  }
  if (filePath.includes(`${resolve(outputRoot, ".codex")}`)) {
    throw new Error("Forbidden .codex directory in demo build");
  }

  const content = await readFile(filePath);
  const text = content.toString("utf8");
  for (const marker of forbiddenMarkers) {
    if (text.includes(marker)) {
      throw new Error(`Forbidden marker ${marker} in ${relative(outputRoot, filePath)}`);
    }
  }
}

let totalBytes = 0;
for (const filePath of outputFiles) totalBytes += (await stat(filePath)).size;

console.log(`Demo build complete: ${outputFiles.length} files, ${totalBytes} bytes -> ${outputRoot}`);
