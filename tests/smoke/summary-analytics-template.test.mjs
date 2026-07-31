import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");

test("summary analytics template assets match the compiled runtime URL", async () => {
  const summaryModulePath = resolve(projectRoot, "dist", "app", "modules", "summary.js");
  const templatePath = resolve(projectRoot, "dist", "modules", "summary", "analytics-block.html");
  const stylesheetPath = resolve(projectRoot, "dist", "modules", "summary", "analytics-block.css");

  await Promise.all([
    access(templatePath),
    access(stylesheetPath)
  ]);

  const summarySource = await readFile(summaryModulePath, "utf8");
  const templateUrlMatch = summarySource.match(
    /new URL\("([^"]*analytics-block\.html)", import\.meta\.url\)/u
  );

  assert.ok(templateUrlMatch, "Compiled summary module should define the analytics template URL");

  const runtimeTemplatePath = fileURLToPath(
    new URL(templateUrlMatch[1], pathToFileURL(summaryModulePath))
  );

  assert.equal(runtimeTemplatePath, templatePath);
});
