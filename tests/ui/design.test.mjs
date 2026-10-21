import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";

const launch = () => chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
async function capture(page, name) {
  if (!process.env.DESIGN_SCREENSHOTS) return;
  await mkdir(process.env.DESIGN_SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: resolve(process.env.DESIGN_SCREENSHOTS, name + ".png"), fullPage: true });
}
async function noOverflow(page) {
  const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, elements: [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 0).slice(0, 12).map(e => e.id || e.className) }));
  assert.ok(overflow.scrollWidth <= overflow.width, JSON.stringify(overflow));
}

test("sidebar resizes from either edge, collapses, restores, and supports keyboard and tooltips", async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await page.goto(server.url + "/demo.html");
    await page.locator("#overviewReadinessValue").filter({ hasText: "25%" }).waitFor();
    const sidebar = page.locator("#workspaceSidebar");
    const right = page.locator('.sidebar-resize[data-edge="right"]');
    const left = page.locator('.sidebar-resize[data-edge="left"]');
    const width = async () => Math.round((await sidebar.boundingBox()).width);
    const drag = async (handle, dx) => {
      const box = await handle.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 100);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + dx, box.y + 100, { steps: 8 });
      await page.mouse.up();
    };
    assert.equal(await width(), 240);
    await capture(page, "overview-light");
    await drag(right, 80);
    assert.equal(await width(), 320);
    await drag(left, 80);
    assert.equal(await width(), 240);
    await drag(right, -160);
    assert.equal(await width(), 64);
    assert.equal(await right.getAttribute("aria-valuenow"), "64");
    const geo = sidebar.locator('[data-target="geo"]');
    await geo.hover();
    await page.locator("#sidebarTooltip").waitFor();
    assert.equal(await page.locator("#sidebarTooltip").textContent(), "Геодезия");
    await page.locator("#sidebarTooltip").hover();
    assert.equal(await page.locator("#sidebarTooltip").isVisible(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#sidebarTooltip").isVisible(), false);
    await geo.focus();
    assert.equal(await page.locator("#sidebarTooltip").isVisible(), true);
    await geo.press("Enter");
    assert.equal(await page.locator("#geo").isVisible(), true);
    assert.equal(await geo.getAttribute("aria-current"), "page");
    await capture(page, "inspection-collapsed");
    await page.reload();
    await sidebar.waitFor();
    assert.equal(await width(), 64);
    await page.locator("#sidebarToggle").click();
    assert.equal(await width(), 240);
    await right.press("End");
    assert.equal(await width(), 360);
    await right.press("Home");
    assert.equal(await width(), 64);
    await right.press("Enter");
    assert.equal(await width(), 360);
    await right.press("ArrowLeft");
    assert.equal(await width(), 344);
    await right.press("ArrowRight");
    assert.equal(await width(), 360);
    const box = await right.boundingBox();
    await page.mouse.move(box.x + 4, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x - 100, box.y + 100);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.equal(await width(), 360, "Escape restores the pre-drag width");
    await page.locator("#themeToggleBtn").click();
    await sidebar.locator('[data-target="overview"]').click();
    await capture(page, "overview-dark");
    await page.locator("#workspaceLanguage").selectOption("en");
    await right.press("Home");
    await geo.focus();
    assert.equal(await page.locator("#sidebarTooltip").textContent(), "Geodesy");
    assert.equal(await page.locator("#sidebarToggle").getAttribute("aria-label"), "Expand sidebar");
    for (const viewportWidth of [1024, 820, 768, 390, 320]) {
      await page.setViewportSize({ width: viewportWidth, height: 900 });
      await noOverflow(page);
      assert.equal(await sidebar.isVisible(), viewportWidth > 768);
      if (viewportWidth <= 768) {
        assert.equal(await page.locator("#bottomNav").isVisible(), true);
        assert.equal(await right.getAttribute("tabindex"), "-1");
      }
    }
    await capture(page, "overview-mobile");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});

test("sidebar ignores corrupt preferences and works when preference storage is unavailable", async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => localStorage.setItem("workspace_sidebar_v1", "broken-json"));
    await page.goto(server.url + "/demo.html");
    await page.locator("#sidebarToggle").waitFor();
    assert.equal(await page.locator('.sidebar-resize[data-edge="right"]').getAttribute("aria-valuenow"), "240");
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      Storage.prototype.getItem = function(key) { if (key === "workspace_sidebar_v1") throw new Error("Unavailable"); return get.call(this, key); };
      Storage.prototype.setItem = function(key, value) { if (key === "workspace_sidebar_v1") throw new Error("Unavailable"); return set.call(this, key, value); };
    });
    await page.goto(server.url + "/demo.html");
    await page.locator("#sidebarToggle").click();
    assert.equal(await page.locator("#workspaceSidebar").getAttribute("data-collapsed"), "true");
    await page.locator("#sidebarToggle").click();
    assert.equal(await page.locator("#workspaceSidebar").getAttribute("data-collapsed"), "false");
  } finally { await browser.close(); await server.close(); }
});

test("public pages share responsive surfaces and auth fields retain accessible names", async () => {
  const server = await startStaticServer(resolve("."));
  const browser = await launch();
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin !== server.url || url.pathname === "/dist/auth.js" || url.pathname === "/dist/firebase.js") return route.fulfill({ contentType: "text/javascript", body: "" });
      return route.continue();
    });
    for (const theme of ["light", "dark"]) {
      await page.addInitScript(value => localStorage.setItem("app_theme", value), theme);
      for (const route of ["login", "register", "about", "privacy", "404"]) {
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(`${server.url}/${route}.html`);
          await noOverflow(page);
          if (["login", "register"].includes(route)) {
            assert.equal(await page.getByLabel("Email", { exact: true }).isVisible(), true);
            assert.equal(await page.getByLabel("Пароль", { exact: true }).isVisible(), true);
            assert.equal(await page.locator(".auth-card").evaluate(e => getComputedStyle(e).backdropFilter), "none");
          }
          if (width !== 320) await capture(page, `${route}-${theme}-${width}`);
        }
      }
    }
  } finally { await browser.close(); await server.close(); }
});

test("profile and account settings retain usable layouts with synthetic account data", async () => {
  const server = await startStaticServer(resolve("."));
  const browser = await launch();
  const repository = await build({ entryPoints: ["src/client/demo/repositories/app-repository.ts"], bundle: true, write: false, format: "esm", platform: "browser" });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== server.url) return route.fulfill({ contentType: "text/css", body: "" });
      if (url.pathname === "/dist/app/repositories/firestore-repository.js") return route.fulfill({ contentType: "text/javascript", body: repository.outputFiles[0].text });
      if (url.pathname === "/dist/auth.js") return route.fulfill({ contentType: "text/javascript", body: "export const logoutUser=async()=>{};" });
      if (url.pathname === "/dist/infrastructure/firebase/auth.js") return route.fulfill({ contentType: "text/javascript", body: `
        const user={uid:'demo-user',email:'demo@local.invalid',providerData:[],getIdToken:async()=>''};
        export const getAuth=()=>({currentUser:user});
        export const onAuthStateChanged=(_,cb)=>{queueMicrotask(()=>cb(user));return ()=>{};};
        export const EmailAuthProvider={credential:()=>({})};
        export const reauthenticateWithCredential=async()=>{};
        export const updatePassword=async()=>{};
        export const updateEmail=async()=>{};` });
      if (url.pathname.endsWith("profile-feed.json")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: [], generatedAt: new Date().toISOString() }) });
      return route.continue();
    });
    for (const theme of ["light", "dark"]) {
      await page.addInitScript(value => localStorage.setItem("app_theme", value), theme);
      for (const route of ["profile", "edit-profile"]) {
        for (const width of [1440, 820, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.goto(`${server.url}/${route}.html`);
          if (route === "profile") await page.locator("#projectsContainer .project-card").first().waitFor();
          else await page.locator("#profileNameInput").waitFor();
          await noOverflow(page);
          if (width !== 820 && width !== 320) await capture(page, `${route}-${theme}-${width}`);
        }
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});

test("all workspace sections fit beside the widest sidebar on a tablet", async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 820, height: 1000 }, reducedMotion: "reduce" });
    await page.goto(server.url + "/demo.html");
    await page.locator("#overviewReadinessValue").filter({ hasText: "25%" }).waitFor();
    await page.locator('.sidebar-resize[data-edge="right"]').press("End");
    for (const target of ["overview", "controlPlan", "journal", "geo", "reinforcement", "geometry", "strength", "summary", "knowledge"]) {
      await page.locator(`.tabs [data-target="${target}"]`).click();
      await page.locator(`#${target}.active`).waitFor();
      await capture(page, `tablet-${target}`);
      await noOverflow(page);
    }
  } finally { await browser.close(); await server.close(); }
});
