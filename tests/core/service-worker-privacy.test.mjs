import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import vm from "node:vm";

test("authenticated PDFs never enter the offline cache or use a cached fallback", async () => {
  const listeners = new Map();
  let writes = 0, reads = 0;
  const source = await transform(await readFile("src/client/sw.ts", "utf8"), { loader: "ts" });
  vm.runInNewContext(source.code, {
    self: { location: { origin: "https://example.test" }, registration: { scope: "https://example.test/" }, addEventListener: (name, callback) => listeners.set(name, callback) },
    URL, Request, Response, console,
    fetch: async () => ({ status: 200, type: "basic", headers: new Headers({ "Cache-Control": "private, no-store" }), clone() { return this; } }),
    caches: { open: async () => ({ put: async () => { writes++; } }), match: async () => { reads++; return new Response("old private PDF"); } }
  });
  let response;
  listeners.get("fetch")({ request: new Request("https://example.test/documents/file?projectId=p", { headers: { Authorization: "Bearer synthetic" } }), respondWith: promise => { response = promise; } });
  if (response) await response;
  await Promise.resolve();
  assert.equal(writes, 0);
  assert.equal(reads, 0);
});
