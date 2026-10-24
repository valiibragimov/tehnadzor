import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";

test("engineering forms preserve beam dimensions and distinguish shaft clear space and landings", { timeout: 90000 }, async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(server.url + "/demo.html");
    await page.locator("#constructionCategory option").first().waitFor({ state: "attached" });
    await page.locator('.tabs [data-target="geometry"]').click();
    await page.locator("#constructionCategory").selectOption("horizontal_load_bearing");
    await page.locator("#constructionType").selectOption("beam");
    await page.locator("#geomFloor").fill("2");
    await page.locator("#btnAddGeomBeam").click();
    await page.locator(".geom-beam-marking").fill("B-17");
    for (const [selector, value] of [[".geom-beam-projBeamWidth", "300"], [".geom-beam-factBeamWidth", "301"], [".geom-beam-projBeamHeight", "600"], [".geom-beam-factBeamHeight", "600"]]) await page.locator(selector).fill(value);
    await page.locator('#geomBeamsList [data-dimension="length"][data-side="project"]').fill("6000");
    await page.locator('#geomBeamsList [data-dimension="length"][data-side="actual"]').fill("6004");
    const criteria = page.locator("#geometry [data-acceptance]");
    await criteria.locator("summary").click();
    await criteria.locator("[data-reference]").fill("Project drawing B17, confirmed dimensional limits");
    for (const key of ["section", "dimensions"]) {
      await criteria.locator(`[data-limit="${key}"] [data-bound="min"]`).fill("-3");
      await criteria.locator(`[data-limit="${key}"] [data-bound="max"]`).fill("6");
    }
    await criteria.locator("[data-confirmed]").check();
    await page.locator("#btnGeom").click();
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].geomChecks).some(check => check.beams?.[0]?.marking === "B-17"));
    const saved = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].geomChecks).find(check => check.beams?.[0]?.marking === "B-17"));
    assert.equal(saved.status, "ok");
    assert.equal(saved.beams[0].physicalDimensions.length.project, "6000");
    assert.equal(saved.beams[0].physicalDimensions.length.actual, "6004");
    assert.ok(saved.beams[0].id);
    await page.locator("#btnClearGeomForm").click();
    await page.locator("#geomChecksList .node").filter({ hasText: "B-17" }).click();
    assert.equal(await page.locator('#geomBeamsList [data-dimension="length"][data-side="actual"]').inputValue(), "6004");
    await page.locator("#constructionCategory").selectOption("stiffness_cores");
    await page.locator("#constructionType").selectOption("elevator_shaft");
    await page.locator('#geometry [data-dimension="clearLength"]').first().waitFor();
    assert.equal(await page.locator("#geomCommonFields").isVisible(), false);
    assert.equal(await page.locator("#geomVertDevField").isVisible(), false);
    await page.locator("#btnAddGeomWall").click();
    assert.equal(await page.locator('#geomWallsList [data-dimension="height"]').count(), 2);
    assert.equal(await page.locator(".geom-wall-projOpeningHeight").isVisible(), false);
    await page.locator("#constructionType").selectOption("stair_core");
    await page.locator("#btnAddGeomStair").click();
    await page.getByRole("combobox", { name: "Элемент лестницы", exact: true }).selectOption("landing");
    assert.equal(await page.locator(".geom-stair-projStepHeight").isVisible(), false);
    assert.equal(await page.locator(".geom-stair-projFlightWidth").isVisible(), true);
    assert.equal(await page.locator('#geomStairsList [data-dimension="length"]').count(), 2);
    await page.locator("#workspaceLanguage").selectOption("en");
    assert.match(await page.locator("#geomStairsList").textContent(), /Physical dimensions/u);
    assert.equal(await page.locator("#geometry [data-reference]").count(), 1);
    await page.locator('.tabs [data-target="documents"]').click();
    assert.equal(await page.locator("#documents h2").innerText(), "As-built documentation");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    assert.equal(await page.locator("#documentsRefresh").isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});

test("metre geodesy preserves legacy evidence and concrete acceptance requires a confirmed conclusion", { timeout: 90000 }, async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(server.url + "/demo.html");
    await page.locator("#constructionCategory option").first().waitFor({ state: "attached" });
    await page.locator('.tabs [data-target="geo"]').click();
    await page.locator("#constructionCategory").selectOption("horizontal_load_bearing");
    await page.locator("#constructionType").selectOption("floor_slab");
    await page.locator('.tabs [data-target="geo"]').click();
    const old = await page.evaluate(() => JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].geoNodes);
    await page.locator("#floor").fill("2");
    for (const [id, value] of [["projX", "100"], ["projY", "200"], ["projH", "3"], ["factX", "100.009"], ["factY", "200"], ["factH", "3"]]) await page.locator("#" + id).fill(value);
    const criteria = page.locator("#geo [data-acceptance]");
    await criteria.locator("summary").click();
    await criteria.locator("[data-reference]").fill("Synthetic project acceptance criterion");
    for (const [key, value] of [["geoPlan", "8"], ["geoHeight", "10"]]) {
      await criteria.locator(`[data-limit="${key}"] [data-bound="min"]`).fill("-" + value);
      await criteria.locator(`[data-limit="${key}"] [data-bound="max"]`).fill(value);
    }
    await criteria.locator("[data-confirmed]").check();
    await page.locator("#btnGeo").click();
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].geoNodes).some(node => node.coordinateUnit === "m" && node.projX === 100));
    const nodes = await page.evaluate(() => JSON.parse(localStorage.getItem("tehnadzor-demo:v2:database")).projectCollections["demo-project"].geoNodes);
    for (const [id, record] of Object.entries(old)) assert.deepEqual(nodes[id], record);
    const measured = Object.values(nodes).find(node => node.coordinateUnit === "m" && node.projX === 100);
    assert.equal(measured.factX, 100.009);
    assert.equal(measured.status, "bad");
    assert.match(await page.locator("#geoResult").innerText(), /9\.0 mm/u);
    await page.locator('.tabs [data-target="strength"]').click();
    await page.locator("#strengthFloor").fill("2");
    await page.locator("#mark").selectOption("B25(М350)");
    await page.locator("#days").fill("28");
    await page.locator("#actual").fill("40");
    await page.locator("#btnStrength").click();
    await page.locator("#strengthResult").filter({ hasText: "Требует проверки" }).waitFor();
    await page.locator("#strengthAssessmentReference").fill("Laboratory 17: assessed class B25, GOST 18105 applicable scheme");
    await page.locator("#strengthAssessmentResponsible").fill("Laboratory engineer");
    await page.locator("#strengthAssessmentDate").fill("2026-10-20");
    await page.locator("#strengthAssessmentVerdict").selectOption("conforms");
    await page.locator("#strengthAssessmentConfirmed").check();
    await page.locator("#btnStrength").click();
    await page.locator("#strengthResult").filter({ hasText: "Соответствует" }).waitFor();
    await page.locator("#actual").fill("20");
    assert.equal(await page.locator("#strengthAssessmentConfirmed").isChecked(), false);
    await page.locator("#btnStrength").click();
    await page.locator("#strengthResult").filter({ hasText: "Требует проверки" }).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});
