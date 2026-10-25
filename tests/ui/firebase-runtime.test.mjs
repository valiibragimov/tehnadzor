import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";
import { resolve } from "node:path";

test("bundled Firebase facades share one app, auth and persistent Firestore runtime", async () => {
  const server = await startStaticServer(resolve("dist"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  const page = await browser.newPage();
  const external = [];
  await page.route("**/*", route => {
    if (new URL(route.request().url()).origin !== server.url) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  try {
    await page.goto(server.url + "/infrastructure/firebase/app.js");
    const result = await page.evaluate(async () => {
      const app = await import("/infrastructure/firebase/app.js");
      const auth = await import("/infrastructure/firebase/auth.js");
      const store = await import("/infrastructure/firebase/firestore.js");
      const instance = app.initializeApp({ apiKey: "demo-test-key", projectId: "demo-runtime-test", appId: "demo-runtime-test" });
      const firestore = store.initializeFirestore(instance, { localCache: store.persistentLocalCache({ tabManager: store.persistentMultipleTabManager() }) });
      const result = { oneApp: app.getApps().length === 1, authApp: auth.getAuth().app === instance, firestoreApp: store.getFirestore().app === instance, sameStore: store.getFirestore() === firestore, persistence: typeof indexedDB !== "undefined" };
      await store.terminate(firestore);
      await store.clearIndexedDbPersistence(firestore);
      await app.deleteApp(instance);
      return result;
    });
    assert.deepEqual(result, { oneApp: true, authApp: true, firestoreApp: true, sameStore: true, persistence: true });
    assert.deepEqual(external, []);
  } finally { await browser.close(); await server.close(); }
});

test("browser localization starts from the served build and handles language changes without a package resolver", async () => {
  const server = await startStaticServer(resolve("dist"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => new URL(route.request().url()).origin === server.url ? route.continue() : route.abort());
    await page.goto(server.url + "/shared/i18n/index.js");
    await page.setContent('<select id="workspaceLanguage"><option value="ru">RU</option><option value="en">EN</option></select><button data-i18n="form_close"></button>');
    await page.evaluate(async () => {
      const { initializeLocalization } = await import("/shared/i18n/index.js");
      await initializeLocalization();
    });
    assert.equal(await page.locator("button").innerText(), "Закрыть");
    await page.locator("#workspaceLanguage").selectOption("en");
    await page.waitForFunction(() => document.documentElement.lang === "en");
    assert.equal(await page.locator("button").innerText(), "Close");
  } finally { await browser.close(); await server.close(); }
});
