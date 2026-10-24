import test from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";

const targets = ["geo", "reinforcement", "geometry", "strength"];
async function openModule(page, target, width) {
  if (width > 768) await page.locator(`.tabs [data-target="${target}"]`).click();
  else {
    await page.locator('#bottomNav [data-tab-group="inspections"]').click();
    await page.locator(`#bottomInspectionMenu [data-tab="${target}"]`).click();
    await page.locator(`#${target} [data-wizard-step="2"]`).click();
  }
}
async function fixture(run) {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? {channel:"chrome"} : {}) });
  try {
    const page = await browser.newPage({ viewport:{width:1440,height:1000}, reducedMotion:"reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(server.url + "/demo.html");
    await page.locator("#overviewReadinessValue").filter({hasText:"0%"}).waitFor();
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
}

// Presentation seam: rendered bounds and interactions, independent of CSS selector specificity.
test("inspection fields and actions fit desktop, tablet and mobile in both themes", {timeout:90000}, async () => fixture(async page => {
  await mkdir("output/playwright/ux", {recursive:true});
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({width,height:1000});
    for (const theme of ["light","dark"]) {
      if (!await page.locator("body").evaluate((body, theme) => body.classList.contains("theme-"+theme),theme)) await page.locator("#themeToggleBtn").click();
      for (const target of targets) {
        await openModule(page,target,width);
        const section = page.locator("#"+target);
        const criteria = section.locator("[data-acceptance]");
        if (await criteria.count() && !await criteria.evaluate(e=>e.open)) await criteria.locator("summary").click();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true, `${width} ${theme} ${target}: page overflow`);
        const overflow = await section.locator("input:visible,select:visible,textarea:visible,fieldset:visible").evaluateAll(elements => elements.filter(e=>{const r=e.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1;}).map(e=>e.id||e.outerHTML.slice(0,80)));
        assert.deepEqual(overflow,[],`${width} ${theme} ${target}: overflowing fields`);
        const action = width > 768 ? section.locator(".inspection-actions .btn-primary") : section.locator(".wizard-footer button");
        await action.scrollIntoViewIfNeeded();
        assert.equal(await action.isVisible(),true);
        assert.match(await action.innerText(),/Проверить и сохранить/u);
        if (target === "geometry" && [1440,390].includes(width) && theme === "light") {
          if (await criteria.count()) await criteria.locator("summary").click();
          await section.locator(".inspection-form-title").scrollIntoViewIfNeeded();
          await page.screenshot({path:`output/playwright/ux/after-geometry-${width}.png`});
        }
      }
    }
  }
}));

test("long select names can be read with keyboard without changing selection or stored evidence", async () => fixture(async page => {
  await page.setViewportSize({width:390,height:844});
  await openModule(page,"geometry",390);
  const fullName = "Производственный корпус «Инженерный» — " + "длинное-наименование-без-пробела".repeat(20);
  const before = await page.evaluate(()=>localStorage.getItem("tehnadzor-demo:v2:database"));
  const selected = await page.locator("#projectSelector").inputValue();
  await page.locator("#projectSelector").evaluate((select, text)=>{select.selectedOptions[0].textContent=text;},fullName);
  const reveal = page.locator("#projectSelector + .select-full-name");
  await reveal.waitFor({state:"visible"});
  await reveal.focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#workspaceHelp").innerText(),fullName);
  assert.equal(await page.locator("#workspaceHelp").evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),true);
  await page.keyboard.press("Escape");
  assert.equal(await reveal.evaluate(e=>document.activeElement===e),true);
  assert.equal(await page.locator("#projectSelector").inputValue(),selected);
  assert.equal(await page.evaluate(()=>localStorage.getItem("tehnadzor-demo:v2:database")),before);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('.tabs [data-target="documents"]').focus();
  await page.locator("#sidebarTooltip").waitFor({state:"visible"});
  assert.match(await page.locator("#sidebarTooltip").innerText(), /Исполнительная документация/u);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#bottomNav [data-tab-group="inspections"]').click();
  await page.locator('#bottomInspectionMenu [data-tab="documents"]').click();
  assert.equal(await page.locator("#documents.active").isVisible(),true);
}));

test("comments stay bounded and coordinate inputs retain project/actual pairs on mobile", async () => fixture(async page => {
  await page.setViewportSize({width:390,height:844});
  await openModule(page,"geometry",390);
  const criteria=page.locator("#geometry [data-acceptance]");
  await criteria.locator("summary").click();
  const comment=criteria.locator("textarea");
  await comment.fill("Комментарий ".repeat(70));
  await comment.evaluate(e=>{e.style.height="2000px";e.style.width="2000px";});
  const size=await comment.boundingBox();
  assert.ok(size.height<=240&&size.width<=390);
  assert.equal(await comment.evaluate(e=>getComputedStyle(e).resize),"vertical");
  await openModule(page,"geo",390);
  await page.locator('[data-sheet-target="geoCoordinatesSheet"]').click();
  const x=await page.locator("#projX").boundingBox(), fx=await page.locator("#factX").boundingBox();
  const y=await page.locator("#projY").boundingBox(), fy=await page.locator("#factY").boundingBox();
  await page.screenshot({path:"output/playwright/ux/after-mobile-coordinates.png"});
  assert.equal(x.y,fx.y); assert.equal(y.y,fy.y); assert.ok(y.y>x.y);
  await page.locator("#projX").fill("100.001");
  await page.locator("#factX").fill("100.002");
  await page.keyboard.press("Escape");
  await page.locator('[data-sheet-target="geoCoordinatesSheet"]').click();
  assert.equal(await page.locator("#projX").inputValue(),"100.001");
  assert.equal(await page.locator("#factX").inputValue(),"100.002");
  await page.screenshot({path:"output/playwright/ux/after-mobile-coordinates.png"});
}));
