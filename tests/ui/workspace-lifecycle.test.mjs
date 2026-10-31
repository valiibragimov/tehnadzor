import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";

const demo = resolve("src/client/demo");
const bundle = await build({ entryPoints: [resolve(demo, "index.ts")], bundle: true, write: false, format: "esm", platform: "browser", plugins: [{
  name: "workspace-lifecycle-fixture",
  setup(context) {
    for (const [pattern, file] of [
      [/document-validation\.js$/, "../shared/documents.ts"],
      [/document-repository\.js$/, "document-repository-shim.ts"],
      [/bim-repository\.js$/, "repositories/bim-repository.ts"],
      [/firestore-repository\.js$/, "repositories/app-repository.ts"],
      [/bim-visual-panel\.js$/, "bim-visual-panel-shim.ts"],
      [/ui\/lazy-libs\.js$/, "lazy-libs-shim.ts"],
      [/infrastructure\/firebase\/auth\.js$/, "firebase-auth-shim.ts"],
      [/infrastructure\/firebase\/firestore\.js$/, "firebase-firestore-shim.ts"],
      [/infrastructure\/firebase\/app\.js$/, "firebase-shim.ts"],
      [/^(?:\.\.\/|\.\/)+firebase\.js$/, "firebase-shim.ts"],
      [/^(?:\.\.\/|\.\/)+auth\.js$/, "auth-shim.ts"]
    ]) context.onResolve({ filter: pattern }, () => ({ path: file === "../shared/documents.ts" ? resolve("src/shared/documents.ts") : resolve(demo, file) }));
    // Expose only the already-public bridge API; count module evaluation, not
    // private implementation calls. All feature implementations remain real.
    context.onLoad({ filter: /[\\/]app\.ts$/ }, async args => ({ contents: await readFile(args.path, "utf8") + "\nglobalThis.__workspaceBridge = appModuleBridge; globalThis.__createWorkspaceBridge = createAppModuleBridge;", loader: "ts" }));
    context.onLoad({ filter: /[\\/]app[\\/]modules[\\/](journal|geometry|summary|strength)\.ts$/ }, async args => ({
      contents: `globalThis.__moduleEvaluations.push(${JSON.stringify(args.path.split(/[\\/]/).at(-1))});\n` + await readFile(args.path, "utf8"), loader: "ts"
    }));
  }
}] });

async function fixture() {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  const context = await browser.newContext();
  const errors = [];
  context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
  return {
    async open() {
      const page = await context.newPage();
      await page.addInitScript(() => { window.__moduleEvaluations = []; });
      await page.route("**/demo.js", route => route.fulfill({ contentType: "text/javascript", body: bundle.outputFiles[0].text }));
      await page.goto(server.url + "/demo.html");
      await page.waitForFunction(() => !!window.__workspaceBridge);
      return page;
    },
    async close() { await browser.close(); await server.close(); assert.deepEqual(errors, []); }
  };
}

test("workspace navigation reinitialization preserves handlers and DOM ownership", async () => {
  const harness = await fixture();
  try {
    const page = await harness.open();
    const result = await page.evaluate(() => {
      let activations = 0;
      const listener = () => activations++;
      document.addEventListener("app:tab-activated", listener);
      const item = document.querySelector(".bottom-nav-item");
      window.__workspaceBridge.initNavigation();
      window.__workspaceBridge.initNavigation();
      document.removeEventListener("app:tab-activated", listener);
      return { activations, sameItem: item === document.querySelector(".bottom-nav-item") };
    });
    assert.deepEqual(result, { activations: 0, sameItem: true });
  } finally { await harness.close(); }
});

test("bridge creation stays lazy and concurrent feature calls reuse initialization after action errors", async () => {
  const harness = await fixture();
  try {
    const page = await harness.open();
    const result = await page.evaluate(async () => {
      const before = window.__moduleEvaluations.length;
      window.__createWorkspaceBridge({ workspace: {}, journalGeodesy: {}, reinforcement: {}, strength: {} });
      const afterConstruction = window.__moduleEvaluations.length;
      const bridge = window.__workspaceBridge;
      const values = await Promise.all([bridge.withGeometryModule(() => 11), bridge.withGeometryModule(() => 12)]);
      const fallback = await bridge.withGeometryModule(() => { throw new Error("synthetic action failure"); }, "fallback");
      const retried = await bridge.withGeometryModule(() => 13);
      return { before, afterConstruction, values, fallback, retried,
        geometryEvaluations: window.__moduleEvaluations.filter(name => name === "geometry.ts").length };
    });
    assert.equal(result.afterConstruction, result.before);
    assert.deepEqual(result.values, [11, 12]);
    assert.equal(result.geometryEvaluations, 1);
    assert.equal(result.fallback, "fallback");
    assert.equal(result.retried, 13);
  } finally { await harness.close(); }
});

test("two workspace documents isolate journal filters and source-check navigation", async () => {
  const harness = await fixture();
  try {
    const first = await harness.open();
    await first.evaluate(async () => {
      const { createDemoDatabaseStore, DEMO_PROJECT_ID } = await import("/demo-core.js");
      const store = createDemoDatabaseStore(localStorage), state = store.read();
      state.projects["second-workspace"] = { ...state.projects[DEMO_PROJECT_ID], id: "second-workspace", name: "Second workspace" };
      state.projectCollections["second-workspace"] = structuredClone(state.projectCollections[DEMO_PROJECT_ID]);
      state.projectCollections["second-workspace"].geomChecks["geom-demo-1"].factPlateHeight = 521;
      for (const [id, record] of Object.entries(state.journal)) {
        if (record.projectId === DEMO_PROJECT_ID) state.journal["second-" + id] = { ...record, projectId: "second-workspace" };
      }
      store.write(state);
    });
    const second = await harness.open();
    await second.locator("#projectSelector").selectOption("second-workspace");
    for (const page of [first, second]) {
      await page.locator('.tabs [data-target="journal"]').click();
      await page.locator("#journalTable tbody tr[data-entry-id]").first().waitFor();
    }
    await second.locator("#journalSearch").fill("missing-from-second-workspace");
    assert.equal(await second.locator("#journalTable tbody tr[data-entry-id]").count(), 0);
    assert.ok(await first.locator("#journalTable tbody tr[data-entry-id]").count() > 0);
    await first.locator("#journalTable tbody tr[data-entry-id]").filter({ hasText: "Геометрия" }).first().click();
    await first.locator("#geometry.active").waitFor();
    await first.waitForFunction(() => document.getElementById("factPlateHeight").value === "514");
    assert.equal(await second.locator("#journal").isVisible(), true);
    assert.equal(await second.locator("#journalSearch").inputValue(), "missing-from-second-workspace");
    assert.equal(await first.locator("#projectSelector").inputValue(), "demo-project");
    assert.equal(await second.locator("#projectSelector").inputValue(), "second-workspace");
  } finally { await harness.close(); }
});
