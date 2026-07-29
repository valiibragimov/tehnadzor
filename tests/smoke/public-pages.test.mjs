import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { startStaticServer } from "./helpers/static-server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");

let staticServer;

before(async () => {
  staticServer = await startStaticServer(projectRoot);
});

after(async () => {
  await staticServer.close();
});

async function fetchText(pathname) {
  const response = await fetch(`${staticServer.url}${pathname}`);
  const body = await response.text();
  return { body, response };
}

test("login page renders the auth shell", async () => {
  const { response, body } = await fetchText("/login.html");

  assert.equal(response.status, 200);
  assert.match(body, /<title>Вход — Tehnadzor<\/title>/);
  assert.match(body, /id="loginEmail"/);
  assert.match(body, /id="loginPassword"/);
  assert.match(body, /id="btnLogin"/);
  assert.match(body, /src="dist\/auth\.js"/);
});

test("register page exposes registration controls", async () => {
  const { response, body } = await fetchText("/register.html");

  assert.equal(response.status, 200);
  assert.match(body, /<title>Регистрация — Tehnadzor<\/title>/);
  assert.match(body, /id="registerEmail"/);
  assert.match(body, /id="registerPassword"/);
  assert.match(body, /id="btnRegister"/);
});

test("about page returns the public product narrative", async () => {
  const { response, body } = await fetchText("/about.html");

  assert.equal(response.status, 200);
  assert.match(body, /О проекте — Tehnadzor/);
  assert.match(body, /Стройконтроль без лишней беготни/);
  assert.match(body, /class="about-cinematic"/);
  assert.match(body, /BIM \/ IFC/);
  assert.match(body, /Нормативный ассистент/);
  assert.match(body, /Повторный контроль/);
  assert.match(body, /Проверка идёт по шагам/);
  assert.match(body, /aboutSceneTitle/);
  assert.match(body, /import\("\.\/app\/ui\/theme\.js"\)/);
  assert.match(body, /--story-progress/);
  assert.doesNotMatch(body, /import \{ initThemeControls \}/);
  assert.doesNotMatch(body, /class="header-actions"/);
});

test("privacy page explains product data handling in plain language", async () => {
  const { response, body } = await fetchText("/privacy.html");

  assert.equal(response.status, 200);
  assert.match(body, /Политика конфиденциальности — Tehnadzor/);
  assert.match(body, /Федерального закона №152-ФЗ/);
  assert.match(body, /BIM \/ IFC-файлами/);
  assert.match(body, /Права пользователя/);
  assert.match(body, /src="dist\/app\/pages\/privacy\.js"/);
  assert.doesNotMatch(body, /<script type="module">\s*import/u);
  assert.doesNotMatch(body, /import \{ initThemeControls \}/);
  assert.doesNotMatch(body, /class="header-actions"/);
});

test("profile page keeps its primary shell accessible", async () => {
  const { response, body } = await fetchText("/profile.html");

  assert.equal(response.status, 200);
  assert.match(body, /Профиль — Tehnadzor/);
  assert.match(body, /id="btnLogout"/);
  assert.match(body, /id="themeToggleBtn"/);
  assert.match(body, /id="profileShareSheetHandle"/);
  assert.match(body, /finishProfileShareSheetDrag/);
  assert.match(body, /profile-settings-sheet__section-title">Security</);
  assert.match(body, /id="profileCurrentPassword"/);
  assert.match(body, /id="profileNewPassword"/);
  assert.match(body, /id="profileConfirmPassword"/);
  assert.match(body, /id="profileChangePasswordButton"/);
  assert.match(body, /reauthenticateWithCredential/);
  assert.match(body, /updatePassword/);
  assert.match(body, /class="profile-page is-profile-loading"/);
  assert.match(body, /document\.documentElement\.style\.backgroundColor = normalized === "light" \? "#f1f5f9" : "#0f172a"/u);
  assert.match(body, /document\.body\.classList\.add\(window\.__appThemeClass \|\| "theme-dark"\)/u);
  assert.match(body, /style\.css\?v=83/u);
  assert.match(body, /function revealProfilePage\(\)/);
  assert.match(body, /document\.body\.classList\.add\("is-profile-ready"\)/);
  assert.doesNotMatch(body, /href="edit-profile\.html#auth"/);
  assert.doesNotMatch(body, />Password and authentication</);
});
