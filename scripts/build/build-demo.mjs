import "./build-index-html.mjs";
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

const demoAdapterPlugin = {
  name: "tehnadzor-demo-adapters",
  setup(buildContext) {
    buildContext.onResolve({ filter: /bim-repository\.js$/ }, () => ({ path: resolve(sourceRoot, "repositories", "bim-repository.ts") }));
    buildContext.onResolve({ filter: /firestore-repository\.js$/ }, () => ({
      path: resolve(sourceRoot, "repositories", "app-repository.ts")
    }));
    buildContext.onResolve({ filter: /bim-visual-panel\.js$/ }, () => ({
      path: resolve(sourceRoot, "bim-visual-panel-shim.ts")
    }));
    buildContext.onResolve({ filter: /ui\/lazy-libs\.js$/ }, () => ({
      path: resolve(sourceRoot, "lazy-libs-shim.ts")
    }));
    buildContext.onResolve({ filter: /infrastructure\/firebase\/auth\.js$/ }, () => ({
      path: resolve(sourceRoot, "firebase-auth-shim.ts")
    }));
    buildContext.onResolve({ filter: /infrastructure\/firebase\/firestore\.js$/ }, () => ({
      path: resolve(sourceRoot, "firebase-firestore-shim.ts")
    }));
    buildContext.onResolve({ filter: /infrastructure\/firebase\/app\.js$/ }, () => ({
      path: resolve(sourceRoot, "firebase-shim.ts")
    }));
    buildContext.onResolve({ filter: /^(?:\.\.\/|\.\/)+firebase\.js$/ }, () => ({
      path: resolve(sourceRoot, "firebase-shim.ts")
    }));
    buildContext.onResolve({ filter: /^(?:\.\.\/|\.\/)+auth\.js$/ }, () => ({
      path: resolve(sourceRoot, "auth-shim.ts")
    }));
  }
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await mkdir(resolve(outputRoot, "modules", "summary"), { recursive: true });

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
  charset: "utf8",
  plugins: [demoAdapterPlugin]
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
  .replace(/<link[^>]+(?:manifest|icon|preconnect|fonts\.googleapis|fonts\.gstatic)[^>]*>\s*/gi, "")
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>Интерактивная демонстрация Tehnadzor</title><link rel="icon" href="data:,">')
  .replace(/<html lang="ru">/i, '<html lang="ru" class="theme-dark">')
  .replace(/<body class="home-page">/i, '<body class="home-page theme-dark">')
  .replace(
    /<meta name="viewport"([^>]+)>/i,
    `<meta name="viewport"$1>\n  <meta name="robots" content="noindex,nofollow">\n  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; base-uri 'none'; form-action 'self'; object-src 'none'">`
  )
  .replace(/<link rel="stylesheet" href="style\.css\?v=\d+"\s*\/?>/i, '<link rel="stylesheet" href="./style.css">')
  .replace(/<link rel="stylesheet" href="liquid-glass\.css\?v=\d+"\s*\/?>/i, '<link rel="stylesheet" href="./liquid-glass.css">')
  .replace(/<link rel="stylesheet" href="dist\/modules\/summary\/analytics-block\.css\?v=\d+"\s*\/?>/i, '<link rel="stylesheet" href="./modules/summary/analytics-block.css">')
  .replace(/<\/body>/i, '  <script type="module" src="./demo.js"></script>\n</body>');

await writeFile(resolve(outputRoot, "demo.html"), demoHtml, "utf8");
await cp(resolve(projectRoot, "style.css"), resolve(outputRoot, "style.css"));
// Real import path and vendor WASM are exercised in the isolated demo as well.
await mkdir(resolve(outputRoot, "dist/app/services"), { recursive: true });
await mkdir(resolve(outputRoot, "dist/app/vendor"), { recursive: true });
await cp(resolve(projectRoot, "dist/app/services/ifc-import-worker.js"), resolve(outputRoot, "dist/app/services/ifc-import-worker.js"));
for (const file of ["ifc-model.bundle.js", "web-ifc.wasm"]) await cp(resolve(projectRoot, "dist/app/vendor", file), resolve(outputRoot, "dist/app/vendor", file));

await cp(resolve(projectRoot, "liquid-glass.css"), resolve(outputRoot, "liquid-glass.css"));
await cp(
  resolve(projectRoot, "src", "client", "app", "modules", "summary", "analytics-block.html"),
  resolve(outputRoot, "modules", "summary", "analytics-block.html")
);
await cp(
  resolve(projectRoot, "src", "client", "app", "modules", "summary", "analytics-block.css"),
  resolve(outputRoot, "modules", "summary", "analytics-block.css")
);

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
  "__FIREBASE_WEB_PROJECT_ID__",
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
