import { build } from "esbuild";
import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const distRoot = resolve(projectRoot, "dist");

const copies = [
  {
    from: resolve(projectRoot, "src", "client", "app", "modules", "summary", "analytics-block.css"),
    to: resolve(distRoot, "modules", "summary", "analytics-block.css")
  },
  {
    from: resolve(projectRoot, "src", "client", "app", "modules", "summary", "analytics-block.html"),
    to: resolve(distRoot, "modules", "summary", "analytics-block.html")
  }
];

for (const entry of copies) {
  await mkdir(dirname(entry.to), { recursive: true });
  await copyFile(entry.from, entry.to);
}

const distSwPath = resolve(distRoot, "sw.js");
const rootSwPath = resolve(projectRoot, "sw.js");

await rm(rootSwPath, { force: true });
await rename(distSwPath, rootSwPath);

console.log("Client postbuild complete:");
for (const entry of copies) {
  console.log(`- copied ${entry.to}`);
}
console.log(`- promoted service worker to ${rootSwPath}`);

await build({
  entryPoints: [resolve(projectRoot, "src/client/infrastructure/api/client.ts")],
  outfile: resolve(distRoot, "infrastructure/api/client.js"),
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true
});

await build({
  entryPoints: [resolve(projectRoot, "src/client/shared/i18n/index.ts")],
  outfile: resolve(distRoot, "shared/i18n/index.js"),
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true
});
