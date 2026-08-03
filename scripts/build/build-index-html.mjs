import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readIndexHtmlSource } from "./index-html-source.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const outputPath = resolve(projectRoot, "index.html");
const outputHtml = await readIndexHtmlSource(projectRoot);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, outputHtml, "utf8");

console.log(`Index HTML rebuilt from partials -> ${outputPath}`);
