import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

const outDir = resolve(projectRoot, "dist", "app", "vendor");
const entryFile = resolve(projectRoot, "dist", "app", "vendor-src", "thatopen-bim-visual-panel.js");
const workerSource = resolve(projectRoot, "node_modules", "@thatopen", "fragments", "dist", "Worker", "worker.mjs");
const wasmSource = resolve(projectRoot, "node_modules", "web-ifc", "web-ifc.wasm");
const ifcLiteWasmSource = resolve(projectRoot, "node_modules", "@ifc-lite", "wasm", "pkg", "ifc-lite_bg.wasm");

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [entryFile],
  outfile: resolve(outDir, "thatopen-bim-visual-panel.bundle.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  sourcemap: true,
  logLevel: "info"
});

await copyFile(workerSource, resolve(outDir, "thatopen-fragments-worker.mjs"));
await copyFile(wasmSource, resolve(outDir, "web-ifc.wasm"));
await copyFile(ifcLiteWasmSource, resolve(outDir, "ifc-lite_bg.wasm"));
