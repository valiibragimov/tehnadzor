import assert from "node:assert/strict";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const demoRoot = path.join(projectRoot, "dist-demo");

class MemoryStorage {
  #values = new Map();

  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key) { this.#values.delete(key); }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
}

const memoryStorage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });
const demoApi = await import(`${pathToFileURL(path.join(demoRoot, "demo-core.js")).href}?v=${Date.now()}`);

test("fixtures use production-shaped project and inspection records", () => {
  const state = demoApi.createDemoFixtures();
  const project = state.projects[demoApi.DEMO_PROJECT_ID];

  assert.equal(state.schemaVersion, 2);
  assert.equal(project.name, "ЖК «Демонстрационный»");
  assert.equal(project.construction, "foundation_slab");
  assert.ok(state.projectCollections[demoApi.DEMO_PROJECT_ID].reinfChecks["reinf-demo-1"]);
  assert.ok(state.projectCollections[demoApi.DEMO_PROJECT_ID].geomChecks["geom-demo-1"]);
  assert.ok(state.projectCollections[demoApi.DEMO_PROJECT_ID].strengthChecks["strength-demo-1"]);
  assert.ok(state.projectCollections[demoApi.DEMO_PROJECT_ID].issues["issue-demo-1"]);
});

test("local database persists visitor changes and reset only clears demo namespace", () => {
  const storage = new MemoryStorage();
  const store = demoApi.createDemoDatabaseStore(storage);
  storage.setItem("unrelated:key", "keep");

  const changed = store.read();
  changed.projects[demoApi.DEMO_PROJECT_ID].name = "Локальное изменение";
  store.write(changed);

  const reopened = demoApi.createDemoDatabaseStore(storage);
  assert.equal(reopened.read().projects[demoApi.DEMO_PROJECT_ID].name, "Локальное изменение");
  assert.equal(reopened.reset().projects[demoApi.DEMO_PROJECT_ID].name, "ЖК «Демонстрационный»");
  assert.equal(storage.getItem("unrelated:key"), "keep");
  assert.deepEqual(store.listKeys(), [demoApi.DEMO_DATABASE_KEY]);
});

test("demo repository adapter supports production collection CRUD", async () => {
  demoApi.resetDemoRepository();
  const projectId = demoApi.DEMO_PROJECT_ID;
  const created = await demoApi.addProjectCollectionDoc(projectId, "reinfChecks", {
    construction: "foundation_slab",
    status: "ok"
  });

  assert.equal((await demoApi.getProjectCollectionDocSnapshot(projectId, "reinfChecks", created.id)).exists(), true);
  await demoApi.updateProjectCollectionDoc(projectId, "reinfChecks", created.id, { status: "exceeded" });
  assert.equal((await demoApi.getProjectCollectionDocSnapshot(projectId, "reinfChecks", created.id)).data().status, "exceeded");
  await demoApi.setProjectCollectionDoc(projectId, "reinfChecks", created.id, { summaryText: "повторный контроль" }, { merge: true });
  assert.equal((await demoApi.getProjectCollectionDocSnapshot(projectId, "reinfChecks", created.id)).data().summaryText, "повторный контроль");
  await demoApi.deleteProjectCollectionDoc(projectId, "reinfChecks", created.id);
  assert.equal((await demoApi.getProjectCollectionDocSnapshot(projectId, "reinfChecks", created.id)).exists(), false);
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

test("demo starts the production shell, navigation and feature forms", async () => {
  const html = await readFile(path.join(demoRoot, "demo.html"), "utf8");
  const bootstrap = await readFile(path.join(projectRoot, "src", "client", "demo", "index.ts"), "utf8");

  assert.match(bootstrap, /import\("\.\.\/app\.js"\)/, "demo must bootstrap the production app composition root");
  for (const id of [
    "projectSelector",
    "constructionCategory",
    "constructionType",
    "construction",
    "bimImportFileState",
    "objectOverview",
    "reinforcement",
    "geometry",
    "strength",
    "controlPlan",
    "summary",
    "journal"
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `production shell is missing #${id}`);
  }
  assert.match(html, /data-target="overview"/);
  assert.match(html, /data-target="reinforcement"/);
  assert.match(html, /data-target="controlPlan"/);
  assert.match(html, /data-target="journal"/);
  assert.match(html, /href="\.\/style\.css"/);
  assert.match(html, /href="\.\/liquid-glass\.css"/);
  assert.match(html, /href="\.\/modules\/summary\/analytics-block\.css"/);
});

test("Firebase, Service Worker and remote libraries are excluded from the demo build", async () => {
  const files = await listFiles(demoRoot);
  const forbiddenExtensions = new Set([".map", ".ts", ".ifc"]);
  const forbiddenMarkers = [
    "www.gstatic.com/firebasejs",
    "firebaseConfig",
    "__FIREBASE_WEB_PROJECT_ID__",
    "tehnadzor-online",
    "private_key",
    "client_secret",
    "serviceAccount",
    "BEGIN PRIVATE KEY",
    "cdn.jsdelivr.net/npm/chart.js",
    "cdnjs.cloudflare.com/ajax/libs/jspdf",
    "serviceWorker.register",
    "profile-feed.js",
    "Building-Architecture",
    "C:\\Users\\"
  ];

  for (const file of files) {
    assert.equal(forbiddenExtensions.has(path.extname(file)), false, file);
    const content = await readFile(file, "utf8");
    for (const marker of forbiddenMarkers) {
      assert.equal(content.includes(marker), false, `${marker} found in ${file}`);
    }
  }

  const html = await readFile(path.join(demoRoot, "demo.html"), "utf8");
  assert.match(html, /connect-src 'self'/);
  assert.doesNotMatch(html, /dist\/app\.js|serviceWorker|firebase/i);

  const script = await readFile(path.join(demoRoot, "demo.js"), "utf8");
  assert.match(script, /Демонстрационный режим/);
  assert.match(script, /Функция недоступна в демонстрационном режиме/);
  assert.match(script, /ЖК «Демонстрационный»/);
});

test("old standalone demo UI and duplicated contracts are removed", async () => {
  for (const relativePath of [
    "src/client/demo/ui.ts",
    "src/client/demo/demo.css",
    "src/client/demo/demo.html",
    "src/client/demo/types.ts",
    "src/client/demo/session.ts",
    "src/client/demo/services/demo-service.ts",
    "src/client/demo/repositories/demo-repository.ts"
  ]) {
    await assert.rejects(access(path.join(projectRoot, relativePath)));
  }

  const runtime = await readFile(path.join(projectRoot, "src", "client", "demo", "runtime.ts"), "utf8");
  assert.doesNotMatch(runtime, /renderOverview|renderControlPlan|renderInspectionForm/);
});

test("demo reuses production stylesheets verbatim and includes a production summary asset", async () => {
  assert.equal(
    await readFile(path.join(demoRoot, "style.css"), "utf8"),
    await readFile(path.join(projectRoot, "style.css"), "utf8")
  );
  assert.equal(
    await readFile(path.join(demoRoot, "liquid-glass.css"), "utf8"),
    await readFile(path.join(projectRoot, "liquid-glass.css"), "utf8")
  );
  assert.ok((await stat(path.join(demoRoot, "modules", "summary", "analytics-block.html"))).size > 0);
  assert.ok((await stat(path.join(demoRoot, "modules", "summary", "analytics-block.css"))).size > 0);
});

test("demo build retains the production UI instead of optimizing it into a mini app", async () => {
  const files = await listFiles(demoRoot);
  let bytes = 0;
  for (const file of files) bytes += (await stat(file)).size;
  assert.ok(bytes > 1_000_000, `production UI bundle is unexpectedly small: ${bytes}`);
  assert.ok(bytes < 4_000_000, `demo build is unexpectedly large: ${bytes}`);
});
