import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";

test("offline cache invalidates lazy modules and theme styles deterministically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tehnadzor-cache-"));
  try {
    await mkdir(join(directory, "scripts/build"), { recursive: true });
    await mkdir(join(directory, "dist"));
    await copyFile(resolve("scripts/build/stamp-service-worker-cache.mjs"), join(directory, "scripts/build/stamp-service-worker-cache.mjs"));
    await writeFile(join(directory, "sw.js"), 'const CACHE_NAME = "tehnadzor-dev"; const STATIC_PAGES = []; const STATIC_ASSETS = [];');
    await writeFile(join(directory, "index.html"), "<!doctype html><title>Fixture</title>");
    await writeFile(join(directory, "theme.css"), "body{color:black}");
    await writeFile(join(directory, "dist/lazy.js"), "export const version=1;");
    const stamp = async () => { execFileSync(process.execPath, [join(directory, "scripts/build/stamp-service-worker-cache.mjs")]); return readFile(join(directory, "sw.js"), "utf8"); };
    const initial = await stamp();
    assert.equal(await stamp(), initial);
    await writeFile(join(directory, "dist/lazy.js"), "export const version=2;");
    const next = await stamp();
    assert.notEqual(next, initial);
    await writeFile(join(directory, "theme.css"), "body{color:white}");
    assert.notEqual(await stamp(), next);
  } finally {
    const insideTemporaryDirectory = relative(resolve(tmpdir()), resolve(directory));
    if (insideTemporaryDirectory && !insideTemporaryDirectory.startsWith("..") && !isAbsolute(insideTemporaryDirectory)) await rm(directory, { recursive: true, force: true });
  }
});
