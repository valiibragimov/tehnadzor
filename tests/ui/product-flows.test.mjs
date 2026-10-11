import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { build } from "esbuild";
import { resolve } from "node:path";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";
import { modelFixture, engineeringFixtures } from "../fixtures/ifc.mjs";

const launch = () => chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });

test("profile creates and opens a project with the shared SDK boundary and isolated storage", async () => {
  const server = await startStaticServer(resolve("."));
  const browser = await launch();
  const repository = await build({ entryPoints: ["src/client/demo/repositories/app-repository.ts"], bundle: true, write: false, format: "esm", platform: "browser" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(server.url).origin) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
      if (url.pathname === "/index.html") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Workspace navigation target</title><main>Project selected</main>" });
      if (url.pathname === "/dist/app/repositories/firestore-repository.js") return route.fulfill({ contentType: "text/javascript", body: repository.outputFiles[0].text });
      if (url.pathname === "/dist/auth.js") return route.fulfill({ contentType: "text/javascript", body: "export const logoutUser=async()=>{};" });
      if (url.pathname === "/dist/infrastructure/firebase/auth.js") return route.fulfill({ contentType: "text/javascript", body: `
        const user={uid:'demo-user',email:'demo@local.invalid',getIdToken:async()=>''};
        export const getAuth=()=>({currentUser:user});
        export const onAuthStateChanged=(_,cb)=>{queueMicrotask(()=>cb(user));return ()=>{};};
        export const EmailAuthProvider={credential:()=>({})};
        export const reauthenticateWithCredential=async()=>{};
        export const updatePassword=async()=>{};
        export const updateEmail=async()=>{};` });
      if (url.pathname.endsWith("profile-feed.json")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], generatedAt: new Date().toISOString() }) });
      return route.continue();
    });
    await page.goto(server.url + "/profile.html");
    await page.locator("#projectsContainer .project-card").first().waitFor();
    await page.locator("#projectSearchInput").fill("Synthetic review project");
    await page.locator("#btnCreateProjectProfile").click();
    const card = page.locator(".project-card").filter({ hasText: "Synthetic review project" });
    await card.waitFor();
    const stored = await page.evaluate(async () => {
      const repository = await import("/dist/app/repositories/firestore-repository.js");
      return Object.values(repository.getDemoRepositoryState().projects).filter(p => p.name === "Synthetic review project");
    });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].ownerUid, "demo-user");
    await card.focus(); await page.keyboard.press("Enter");
    await page.waitForURL("**/index.html");
    assert.equal(await page.evaluate(() => localStorage.getItem("current_project_id")), stored[0].id);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});

test("real IFC import, engineering localization, bounded model selection and report downloads", { timeout: 90000 }, async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(server.url + "/demo.html");
    await page.locator("#overviewReadinessValue").filter({ hasText: "25%" }).waitFor();
    await page.locator("#bimModelManager summary").click();
    await page.locator("#ifcFileInput").setInputFiles({ name: "review.ifc", mimeType: "application/octet-stream", buffer: Buffer.from(modelFixture()) });
    await page.locator("#btnImportIfc").click();
    await page.locator("[data-ifc-check-import]").click();
    await page.waitForFunction(() => document.getElementById("bimImportStatus").textContent.includes("Импортировано"));
    const imported = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].elements).find(e => e.name === "Column; with /* literal */ text"));
    assert.deepEqual([imported.projectX, imported.projectY, imported.projectH], [1000, 2000, 3000]);
    // Exercise exactly the same WASM adapter on exporter-shaped complex cases in the browser.
    for (const [name, bytes] of Object.entries(engineeringFixtures())) {
      const result = await page.evaluate(({ bytes, name }) => new Promise((resolve, reject) => {
        const worker = new Worker("./dist/app/services/ifc-import-worker.js", { type: "module" });
        worker.onmessage = ({ data }) => { if (data.type === "result") { worker.terminate(); resolve(data.result); } else if (data.type === "error") { worker.terminate(); reject(new Error(data.error)); } };
        worker.onerror = e => { worker.terminate(); reject(new Error(e.message)); };
        worker.postMessage({ type: "parse-ifc", file: new File([new Uint8Array(bytes)], name + ".ifc"), options: { sourceModelId: name.toLowerCase() } });
      }), { bytes: [...bytes], name });
      assert.equal(result.importedCount, 1);
      if (name === "bodyAndAxis") assert.equal(result.elements[0].sectionWidth, 300);
      if (name === "nestedRotation") assert.equal(result.elements[0].projectX, 3999998000);
      if (["mappedBody", "booleanBody"].includes(name)) assert.equal(result.elements[0].sectionWidth, null);
    }
    await page.evaluate(() => {
      const key = "tehnadzor-demo:v2:database", state = JSON.parse(localStorage.getItem(key));
      const elements = state.projectCollections["demo-project"].elements;
      for (let i = 0; i < 10000; i++) elements["large-" + i] = { elementId: "large-" + i, type: "column", mark: "C-" + i, sourceModelId: "large", projectX: i, projectY: 0, projectH: 0 };
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.reload();
    await page.locator("#geoBimElementSelectResults").waitFor({ state: "attached" });
    assert.ok(await page.locator("#geoBimElementSelect option").count() <= 102);
    await page.locator("#workspaceLanguage").selectOption("en");
    for (const target of ["geo", "reinforcement", "geometry", "strength"]) {
      await page.locator(`.tabs [data-target="${target}"]`).click();
      assert.equal(await page.locator(`#${target} h2`).evaluate(e => /[А-Яа-я]/u.test(e.textContent)), false);
    }
    await page.locator('.tabs [data-target="geometry"]').click();
    assert.match(await page.locator("#geomChecksList").innerText(), /Inspection on/);
    assert.match(await page.locator("#geomChecksList").innerText(), /Thickness:/);
    assert.equal(await page.locator("#geomChecksList .node").first().evaluate(e => getComputedStyle(e).boxShadow), "none");
    await page.locator("#geometry details.bim-selection summary").click();
    await page.locator("#geomBimSearchInput").fill("C-9999");
    await page.waitForFunction(() => document.getElementById("geomBimElementSelect").options.length === 2);
    await page.locator("#geomBimElementSelect").selectOption("large-9999");
    await page.locator("#workspaceLanguage").selectOption("ru");
    assert.equal(await page.locator("#geomBimElementSelect").inputValue(), "large-9999");
    await page.locator('.tabs [data-target="controlPlan"]').click();
    const download = page.waitForEvent("download"); await page.locator("#btnControlPlanExportCsv").click();
    assert.match((await download).suggestedFilename(), /\.csv$/);
    await page.locator('.tabs [data-target="journal"]').click();
    await page.locator('.action-menu[data-menu="journal"] .menu-trigger').click();
    const json = page.waitForEvent("download"); await page.locator("#btnJournalExportJson").click();
    assert.match((await json).suggestedFilename(), /\.json$/);
    await page.locator(".journal-issue-card__repeat-action").first().click();
    await page.locator("#geometry.active").waitFor();
    await page.waitForFunction(() => document.getElementById("factPlateHeight").value === "514");
    await page.locator("#factPlateHeight").fill("500");
    await page.locator("#btnGeom").click();
    await page.waitForFunction(() => {
      const state = JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"];
      return state.issues["issue-demo-1"].repeatControlStatus === "ok";
    });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].geomChecks["geom-demo-1"].factPlateHeight), 514);
    await page.locator('.tabs [data-target="journal"]').click();
    await page.locator(".journal-issue-card__action").filter({ hasText: "Закрыть замечание" }).first().click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].issues["issue-demo-1"].status === "closed");

    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});


test("engineering forms update legacy records and save a survey point", { timeout: 45000 }, async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.goto(server.url + "/demo.html");
    await page.locator("#overviewReadinessValue").filter({ hasText: "25%" }).waitFor();
    for (const [tab, list, button, collection, id, field, value] of [
      ["reinforcement", "reinfChecksList", "btnReinf", "reinfChecks", "reinf-demo-1", "factCover", "42"],
      ["strength", "strengthChecksList", "btnStrength", "strengthChecks", "strength-demo-1", "actual", "28.5"]
    ]) {
      await page.locator(`.tabs [data-target="${tab}"]`).click();
      await page.locator(`#${list} .node`).first().click();
      await page.waitForFunction(({ field, tab }) => document.getElementById(field).value === (tab === "strength" ? "27.2" : "41"), { field, tab });
      await page.locator("#" + field).fill(value);
      await page.locator("#" + button).click();
      await page.waitForFunction(({ collection, id, field, value }) => {
        const records = JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"][collection];
        return Object.keys(records).length === 1 && records[id][field] === Number(value) && records[id].floor === "-1" && records[id].location === "А-Г, 1-4";
      }, { collection, id, field, value });
    }
    await page.locator('.tabs [data-target="geo"]').click();
    if (await page.locator("#floor").isVisible()) await page.locator("#floor").fill("-1");
    for (const [id, value] of [["projX", "100"], ["factX", "100.002"], ["projY", "200"], ["factY", "200.003"], ["projH", "3"], ["factH", "3.001"]]) {
      if (await page.locator("#" + id).isVisible()) await page.locator("#" + id).fill(value);
    }
    await page.locator("#btnGeo").click();
    await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].geoNodes).length === 1);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});
