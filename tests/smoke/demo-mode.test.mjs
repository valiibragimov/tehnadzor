import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const demoRoot = path.join(projectRoot, "dist-demo");
const demoApi = await import(`${pathToFileURL(path.join(demoRoot, "demo-core.js")).href}?v=${Date.now()}`);

class MemoryStorage {
  #values = new Map();

  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key) { this.#values.delete(key); }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
}

function createRuntime(storage = new MemoryStorage()) {
  let sequence = 0;
  const scoped = demoApi.createDemoStorage(storage);
  const session = demoApi.createDemoSession(scoped);
  const repository = demoApi.createDemoRepository({
    session,
    createId: (prefix) => `${prefix}-test-${++sequence}`
  });
  const service = demoApi.createDemoService(repository, {
    now: () => "2026-08-03T12:00:00.000Z"
  });
  session.initialize();
  return { storage, scoped, session, repository, service };
}

test("runtime mode defaults to production and recognizes demo entrypoints", () => {
  assert.equal(demoApi.resolveAppRuntimeMode({ pathname: "/", search: "" }), "production");
  assert.equal(demoApi.resolveAppRuntimeMode({ pathname: "/index.html", search: "" }), "production");
  assert.equal(demoApi.resolveAppRuntimeMode({ pathname: "/demo.html", search: "" }), "demo");
  assert.equal(demoApi.resolveAppRuntimeMode({ pathname: "/", search: "?demo=1" }), "demo");
});

test("fixtures initialize once and preserve visitor changes", () => {
  const runtime = createRuntime();
  const initial = runtime.session.read();
  initial.project.name = "Изменённый демонстрационный объект";
  runtime.session.write(initial);

  const reopened = demoApi.createDemoSession(demoApi.createDemoStorage(runtime.storage));
  assert.equal(reopened.initialize().project.name, "Изменённый демонстрационный объект");
});

test("reset clears only the demo namespace and restores fixtures", () => {
  const runtime = createRuntime();
  runtime.storage.setItem("unrelated:key", "keep-me");
  const changed = runtime.session.read();
  changed.project.name = "Изменено";
  runtime.session.write(changed);

  const reset = runtime.session.reset();
  assert.equal(reset.project.name, "Демонстрационный объект");
  assert.equal(runtime.storage.getItem("unrelated:key"), "keep-me");
  assert.deepEqual(runtime.scoped.listKeys(), [
    `${demoApi.DEMO_STORAGE_NAMESPACE}schema`,
    `${demoApi.DEMO_STORAGE_NAMESPACE}state`
  ]);
});

test("demo repository supports local inspection CRUD", () => {
  const { repository } = createRuntime();
  const created = repository.createInspection({
    module: "strength",
    title: "Контроль прочности Б-02",
    constructionMark: "Б-02",
    createdAt: "2026-08-03T12:00:00.000Z",
    status: "done",
    summary: "Соответствует",
    measurements: []
  });
  assert.equal(repository.getState().inspections[0].id, created.id);
  assert.equal(repository.updateInspection(created.id, { summary: "Обновлено" })?.summary, "Обновлено");
  assert.equal(repository.deleteInspection(created.id), true);
  assert.equal(repository.getState().inspections.some((item) => item.id === created.id), false);
});

test("demo repository supports local issue CRUD", () => {
  const { repository } = createRuntime();
  const created = repository.createIssue({
    title: "Синтетическое замечание",
    constructionMark: "К-02",
    description: "Только локальные данные",
    createdAt: "2026-08-03T12:00:00.000Z",
    status: "open",
    linkedTaskId: null,
    repeatControlAt: null
  });
  assert.equal(repository.updateIssue(created.id, { status: "resolved" })?.status, "resolved");
  assert.equal(repository.deleteIssue(created.id), true);
  assert.equal(repository.getState().issues.some((item) => item.id === created.id), false);
});

test("inspection and issue actions persist after a new session", () => {
  const runtime = createRuntime();
  const initialInspectionCount = runtime.service.getState().inspections.length;
  const initialIssueCount = runtime.service.getState().issues.length;

  runtime.service.createInspection({
    module: "reinforcement",
    constructionMark: "К-02",
    projectValue: 16,
    actualValue: 16,
    tolerance: 0,
    unit: "мм"
  });
  runtime.service.createIssue({
    title: "Демонстрационное замечание",
    constructionMark: "К-02",
    description: "Корректирующее действие"
  });

  const reopened = createRuntime(runtime.storage);
  assert.equal(reopened.service.getState().inspections.length, initialInspectionCount + 1);
  assert.equal(reopened.service.getState().issues.length, initialIssueCount + 1);
  assert.equal(reopened.service.getState().journal[0].kind, "issue");
});

test("repeat control resolves issue and its linked plan task", () => {
  const { service } = createRuntime();
  const resolved = service.resolveIssueWithRepeatControl("issue-open-01");
  assert.equal(resolved?.status, "resolved");
  const state = service.getState();
  assert.equal(state.controlPlan.find((task) => task.id === "task-geometry-wall")?.status, "resolved");
  assert.equal(state.journal[0].kind, "repeat-control");
});

test("readiness uses only object tasks and counts resolved as complete", () => {
  const { service } = createRuntime();
  const metrics = service.getMetrics();
  assert.deepEqual(metrics, {
    completed: 3,
    total: 5,
    percent: 60,
    openIssues: 1,
    deviations: 1,
    factoryTasks: 1
  });
});

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(entryPath));
    else files.push(entryPath);
  }
  return files;
}

test("demo build is standalone, network-isolated and contains no private runtime markers", async () => {
  const files = await listFiles(demoRoot);
  assert.deepEqual(files.map((file) => path.basename(file)).sort(), [
    "demo-core.js",
    "demo.css",
    "demo.html",
    "demo.js"
  ]);

  const forbiddenExtensions = new Set([".map", ".ts", ".ifc"]);
  const forbiddenMarkers = [
    "apiKey",
    "firebaseConfig",
    "tehnadzor-online",
    "projectId",
    "private_key",
    "client_secret",
    "serviceAccount",
    "BEGIN PRIVATE KEY",
    "Building-Architecture",
    "C:\\Users\\",
    "initializeApp",
    "getFirestore",
    "getAuth"
  ];

  for (const file of files) {
    assert.equal(forbiddenExtensions.has(path.extname(file)), false);
    const content = await readFile(file, "utf8");
    for (const marker of forbiddenMarkers) {
      assert.equal(content.includes(marker), false, `${marker} found in ${file}`);
    }
  }

  const html = await readFile(path.join(demoRoot, "demo.html"), "utf8");
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /id="demoApp"/);
  assert.match(html, /Интерактивная демонстрация Tehnadzor/);
  assert.doesNotMatch(html, /login|register|serviceWorker/i);

  const script = await readFile(path.join(demoRoot, "demo.js"), "utf8");
  assert.match(script, /Упрощённая презентационная версия на синтетических данных/);
  assert.match(script, /Функциональность упрощена, все данные синтетические/);
  assert.match(script, /Ближайшее действие/);
});

test("demo build remains compact", async () => {
  const files = await listFiles(demoRoot);
  let bytes = 0;
  for (const file of files) bytes += (await stat(file)).size;
  assert.ok(bytes > 0);
  assert.ok(bytes < 500_000, `demo build is unexpectedly large: ${bytes}`);
});
