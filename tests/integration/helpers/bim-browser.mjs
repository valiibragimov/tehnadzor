/* global window */
// window references run inside Playwright browser callbacks.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";

export async function checkBrowserBimStartup() {
  const address = process.env.FIRESTORE_EMULATOR_HOST || "";
  assert.match(address, /^(127\.0\.0\.1|localhost):\d+$/u);
  const [host, port] = address.split(":");
  const projectId = "demo-bim-browser-startup";
  const environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile("firestore.rules", "utf8") } });
  let browser, server;
  try {
    await environment.withSecurityRulesDisabled(async context => {
      for (const id of ["project-a", "project-b"]) {
        await setDoc(doc(context.firestore(), "projects", id), { ownerUid: "owner", createdBy: "owner" });
        await setDoc(doc(context.firestore(), "projects", id, "elements", "model_legacy"), { elementId: "model_legacy", sourceModelId: "model", name: id });
      }
    });
    const bundle = await build({
      stdin: { resolveDir: process.cwd(), contents: `
        import { initializeApp } from 'firebase/app';
        import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
        const app = initializeApp({ projectId: '${projectId}', apiKey: 'demo-key', appId: 'demo' });
        const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
        connectFirestoreEmulator(db, '${host}', ${Number(port)}, { mockUserToken: { sub: 'owner', user_id: 'owner' } });
        globalThis.bimTestDb = db;
        globalThis.bimTestAuth = { currentUser: { uid: 'owner' } };
        const repository = await import('./src/client/app/repositories/bim-repository.ts');
        window.bim = {
          load: async (id, count = 8) => Promise.all(Array.from({ length: count }, () => repository.getProjectBimSnapshot(id))).then(snapshots => snapshots.map(s => s.docs.map(d => d.data().name))),
          publish: () => repository.publishProjectBimModel('project-a', 'model', [{ elementId: 'model_new', sourceModelId: 'model', name: 'published' }])
        };
      ` }, bundle: true, write: false, platform: "browser", format: "esm", target: "es2022",
      plugins: [{ name: "emulator-project", setup(context) {
        context.onResolve({ filter: /infrastructure\/bim-publication\.js$/ }, () => ({ path: fileURLToPath(new URL("../../../src/shared/bim/publication.ts", import.meta.url)) }));
        context.onResolve({ filter: /(?:^|\/)firebase\.js$/ }, () => ({ path: "db", namespace: "bim-test" }));
        context.onLoad({ filter: /.*/, namespace: "bim-test" }, () => ({ contents: "export const db=globalThis.bimTestDb; export const auth=globalThis.bimTestAuth;" }));
      } }]
    });
    server = createServer((req, res) => {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", req.url === "/bim.js" ? "text/javascript" : "text/html");
      res.end(req.url === "/bim.js" ? bundle.outputFiles[0].text : '<script type="module" src="/bim.js"></script>');
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
    const page = await browser.newPage();
    const unhandled = [];
    let acquisitions = 0;
    page.on("pageerror", error => unhandled.push(error.message));
    page.on("request", request => {
      if (!request.url().includes("/documents:commit")) return;
      const writes = request.postDataJSON()?.writes || [];
      if (writes.some(write => write.update?.name.includes("/bimReaders/")) && writes.some(write => write.update?.name.endsWith("/bimState/current"))) acquisitions++;
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    async function reload() { await page.goto(url); await page.waitForFunction(() => window.bim); }
    await reload();
    assert.deepEqual(await page.evaluate(() => window.bim.load("project-a")), Array.from({ length: 8 }, () => ["project-a"]));
    assert.equal(acquisitions, 1, "one reader acquisition for simultaneous startup consumers");
    await page.evaluate(() => window.bim.publish());
    acquisitions = 0;
    assert.deepEqual(await page.evaluate(() => window.bim.load("project-a")), Array.from({ length: 8 }, () => ["published"]));
    assert.equal(acquisitions, 1);
    await reload();
    acquisitions = 0;
    assert.deepEqual(await page.evaluate(() => window.bim.load("project-a")), Array.from({ length: 8 }, () => ["published"]));
    assert.equal(acquisitions, 1, "reload validates fresh storage and shares its reader");
    // A denied initial acquisition must settle every consumer and permit a later retry.
    await page.route("**/documents:commit**", route => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "synthetic denied acquisition" } }) }));
    const failed = await page.evaluate(() => Promise.allSettled(Array.from({ length: 8 }, () => window.bim.load("project-b", 1))).then(xs => xs.map(x => x.status)));
    assert.deepEqual(failed, Array(8).fill("rejected"));
    await page.unroute("**/documents:commit**");
    assert.deepEqual(await page.evaluate(() => window.bim.load("project-b")), Array.from({ length: 8 }, () => ["project-b"]));
    assert.deepEqual(await page.evaluate(() => window.bim.load("project-a")), Array.from({ length: 8 }, () => ["published"]));
    assert.deepEqual(unhandled, []);
  } finally {
    await browser?.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await environment.cleanup();
  }
}
