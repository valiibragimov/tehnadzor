import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { resolve } from "node:path";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";

test("email and Google login use the configured Firebase app", async () => {
  const server = await startStaticServer(resolve("."));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  const page = await browser.newPage();
  let emailRequest = false;
  let emailError = "INVALID_LOGIN_CREDENTIALS";
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === server.url) {
      // OAuth account selection needs a human. Stub only the popup boundary;
      // the login handler and configured Firebase app remain real.
      if (url.pathname === "/dist/infrastructure/firebase/auth.js" && !url.search) {
        return route.fulfill({ contentType: "text/javascript", body: `
          export * from './auth.js?original';
          export async function signInWithPopup(auth, provider) {
            window.googleConfigCheck = { configured: !!auth.app.options.apiKey && auth.app.options.apiKey !== 'demo-api-key', provider: provider.providerId };
            throw { code: 'auth/popup-closed-by-user' };
          }
        ` });
      }
      return route.continue();
    }
    if (url.pathname.endsWith("/accounts:signInWithPassword")) {
      emailRequest = true;
      assert.equal(Boolean(url.searchParams.get("key")), true);
      if (process.env.FIREBASE_CONFIG_MODE !== "test") assert.equal(url.searchParams.get("key") === "demo-api-key", false);
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { message: emailError } }) });
    }
    return route.abort();
  });
  try {
    await page.goto(server.url + "/login.html");
    await page.waitForFunction(() => document.querySelector("#btnLogin")?.dataset !== undefined);
    await page.fill("#loginEmail", "synthetic@example.invalid");
    await page.fill("#loginPassword", "synthetic-password");
    await page.click("#btnLogin");
    await page.waitForFunction(() => !document.querySelector("#authMessage").hidden);
    assert.equal(emailRequest, true);
    emailError = "API key not valid. Please pass a valid API key.";
    await page.fill("#loginPassword", "another-synthetic-password");
    await page.click("#btnLogin");
    await page.waitForFunction(() => !document.querySelector("#authMessage").hidden);
    assert.match(await page.locator("#authMessage").innerText(), /конфигураци[яи]/u);
    assert.equal(await page.locator("#loginPassword").getAttribute("aria-invalid"), "false");
    await page.click("#btnGoogleLogin");
    await page.waitForFunction(() => window.googleConfigCheck);
    const check = await page.evaluate(() => window.googleConfigCheck);
    assert.equal(check.provider, "google.com");
    if (process.env.FIREBASE_CONFIG_MODE !== "test") assert.equal(check.configured, true);
  } finally { await browser.close(); await server.close(); }
});
