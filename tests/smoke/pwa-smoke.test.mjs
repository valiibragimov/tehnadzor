import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import { startStaticServer } from "./helpers/static-server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");

let staticServer;

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath));
    } else {
      files.push(absolutePath);
    }
  }

  return files;
}

before(async () => {
  staticServer = await startStaticServer(projectRoot);
});

after(async () => {
  await staticServer.close();
});

test("manifest resolves icons and shortcut targets", async () => {
  const response = await fetch(`${staticServer.url}/manifest.json`);
  const manifest = await response.json();

  assert.equal(response.status, 200);
  assert.equal(manifest.name, "Tehnadzor");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2);

  for (const icon of manifest.icons) {
    const iconResponse = await fetch(`${staticServer.url}/${String(icon.src).replace(/^\/+/, "")}`);
    assert.equal(iconResponse.status, 200, `Icon should be reachable: ${icon.src}`);
  }

  for (const shortcut of manifest.shortcuts) {
    const shortcutUrl = new URL(shortcut.url, staticServer.url);
    const shortcutResponse = await fetch(shortcutUrl);
    assert.equal(shortcutResponse.status, 200, `Shortcut should be reachable: ${shortcut.url}`);
  }
});

test("service worker keeps dynamic precache discovery and no stale stylesheet pin", async () => {
  const response = await fetch(`${staticServer.url}/sw.js`);
  const swSource = await response.text();

  assert.equal(response.status, 200);
  assert.match(swSource, /discoverInstallAssets/);
  assert.match(swSource, /MANIFEST_URL = "manifest\.json"/);
  assert.match(swSource, /CACHE_NAME = "tehnadzor-[a-f0-9]{12}"/);
  assert.doesNotMatch(swSource, /style\.css\?v=17/);
});

test("index page still wires PWA registration and manifest link", async () => {
  const response = await fetch(`${staticServer.url}/index.html`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /rel="manifest" href="manifest\.json"/);
  assert.match(html, /navigator\.serviceWorker\.register\('sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(html, /window\.__appThemeClass = className/u);
  assert.match(html, /html\.theme-light body\s*\{\s*background-color:\s*#f1f5f9/u);
  assert.match(html, /<body class="home-page">\s*<script>\s*document\.body\.classList\.add\(window\.__appThemeClass/u);
  assert.match(html, /id="appThemeColor"/u);
});

test("firebase hosting keeps baseline security headers", async () => {
  const rawConfig = await readFile(resolve(projectRoot, "firebase.json"), "utf8");
  const config = JSON.parse(rawConfig);
  const globalHeaders = config.hosting.headers.find((entry) => entry.source === "**")?.headers || [];
  const headerValues = new Map(globalHeaders.map((header) => [header.key, header.value]));

  assert.equal(headerValues.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headerValues.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headerValues.get("X-Frame-Options"), "DENY");
  assert.match(String(headerValues.get("Permissions-Policy") || ""), /camera=\(\)/);
  assert.match(String(headerValues.get("Permissions-Policy") || ""), /geolocation=\(\)/);
});

test("journal exposes the issue registry workflow", async () => {
  const response = await fetch(`${staticServer.url}/index.html`);
  const html = await response.text();
  const journalSource = await readFile(resolve(projectRoot, "src/client/app/modules/journal.ts"), "utf8");
  const appSource = await readFile(resolve(projectRoot, "src/client/app.ts"), "utf8");
  const summarySource = await readFile(resolve(projectRoot, "src/client/app/modules/summary.ts"), "utf8");
  const css = await readFile(resolve(projectRoot, "style.css"), "utf8");

  assert.equal(response.status, 200);
  assert.match(html, /id="journalIssuesPanel"/u);
  assert.match(html, /id="journalIssueList"/u);
  assert.match(html, /id="summaryIssuesPanel"/u);
  assert.match(html, /summary-overview-row/u);
  assert.match(html, /summary-issues-title">Замечания</u);
  assert.doesNotMatch(html, /Связка нарушения, замечания, повторного контроля/u);
  assert.match(html, /Создайте замечание из строки журнала/u);
  assert.match(journalSource, /from "\.\.\/services\/issues\.js"/u);
  assert.match(journalSource, /createIssueFromJournalEntry/u);
  assert.match(journalSource, /updateProjectIssueStatus/u);
  assert.match(journalSource, /deleteIssueFromRegistry/u);
  assert.match(journalSource, /deleteProjectIssue/u);
  assert.match(journalSource, /findGeoNodeKeyForJournalEntry/u);
  assert.match(journalSource, /startRepeatControlForIssue/u);
  assert.match(journalSource, /linkRepeatControlFromJournalEntry/u);
  assert.match(journalSource, /Закрытие доступно только после повторного контроля/u);
  assert.doesNotMatch(journalSource, /entry\.context\.includes\(nodeId\)/u);
  assert.doesNotMatch(appSource, /if \(journalAdded\) skipGeoJournalOnce = true/u);
  assert.match(journalSource, /repeatControlJournalEntryId/u);
  assert.match(journalSource, /Повторный контроль/u);
  assert.match(summarySource, /loadProjectIssues/u);
  assert.match(summarySource, /renderSummaryIssuesPanel/u);
  assert.match(summarySource, /buildSummaryIssueReportItems/u);
  assert.match(summarySource, /Merge inspections with module collections/u);
  assert.match(summarySource, /Открытых замечаний/u);
  assert.match(summarySource, /Повторный контроль/u);
  assert.match(css, /summary-status-badge\.resolved/u);
  assert.match(summarySource, /summary-issue-registry__header/u);
  assert.match(summarySource, /summary-issue-registry__item/u);
  assert.match(css, /summary-issue-registry__row/u);
  assert.match(css, /summary-overview-row/u);
  assert.match(css, /\.summary-issues-list\s*\{[\s\S]*?max-height:/u);
  assert.match(css, /\.summary-issues-list\s*\{[\s\S]*?overflow-y:\s*auto/u);
  assert.match(css, /\.journal-issue-list\s*\{[\s\S]*?max-height:/u);
  assert.match(css, /\.journal-issue-list\s*\{[\s\S]*?overflow-y:\s*auto/u);
  assert.match(css, /#journal \.journal-issues-panel\.card:hover/u);
});

test("control plan module exposes ITP workflow", async () => {
  const response = await fetch(`${staticServer.url}/index.html`);
  const html = await response.text();
  const runtimeSource = await readFile(resolve(projectRoot, "src/client/app/module-runtime.ts"), "utf8");
  const serviceSource = await readFile(resolve(projectRoot, "src/client/app/services/control-plan.ts"), "utf8");
  const moduleSource = await readFile(resolve(projectRoot, "src/client/app/modules/control-plan.ts"), "utf8");
  const summarySource = await readFile(resolve(projectRoot, "src/client/app/modules/summary.ts"), "utf8");
  const css = await readFile(resolve(projectRoot, "style.css"), "utf8");

  assert.equal(response.status, 200);
  assert.match(html, /data-target="controlPlan"/u);
  assert.match(html, /id="controlPlan"/u);
  assert.match(html, /Матрица ITP/u);
  assert.match(html, /id="controlPlanStatusFilters"/u);
  assert.match(html, /id="controlPlanSearch"/u);
  assert.match(html, /id="btnControlPlanExportCsv"/u);
  assert.match(html, /id="btnControlPlanExportPdf"/u);
  assert.match(runtimeSource, /modules\/control-plan\.js/u);
  assert.match(serviceSource, /loadProjectControlPlan/u);
  assert.match(serviceSource, /getInspectionConfig/u);
  assert.match(serviceSource, /loadJournalEntries/u);
  assert.match(serviceSource, /loadProjectIssues/u);
  assert.match(serviceSource, /sourceRowMap/u);
  assert.match(serviceSource, /decodeSourceContext/u);
  assert.match(serviceSource, /linkedProjectRecords/u);
  assert.match(serviceSource, /recordHasJournalLink/u);
  assert.match(serviceSource, /formworkElementName/u);
  assert.doesNotMatch(serviceSource, /record\.sourceId\s*\?\?\s*""/u);
  assert.doesNotMatch(serviceSource, /rowMap\.size\s*===\s*0\s*&&\s*options\.fallbackConstruction/u);
  assert.match(moduleSource, /updateControlPlan/u);
  assert.match(moduleSource, /control-plan-task/u);
  assert.match(moduleSource, /controlPlanStatusFilter/u);
  assert.match(moduleSource, /activateAppTarget/u);
  assert.match(moduleSource, /data-control-plan-target/u);
  assert.match(moduleSource, /exportControlPlanCsv/u);
  assert.match(moduleSource, /exportControlPlanPdf/u);
  assert.match(moduleSource, /ensureJsPdfLoaded/u);
  assert.match(moduleSource, /loadDocumentRequisites/u);
  assert.match(summarySource, /План контроля \/ ITP/u);
  assert.match(summarySource, /loadDocumentRequisites/u);
  assert.match(summarySource, /missingRequiredChecks/u);
  assert.match(css, /control-plan-table/u);
  assert.match(css, /control-plan-filter-btn/u);
  assert.match(css, /control-plan-toolbar-actions/u);
  assert.match(css, /control-plan-next-action/u);
  assert.match(css, /control-plan-status--blocked/u);
  assert.match(css, /#btnControlPlanRefresh\.btn-small/u);
});

test("object overview and grouped inspection navigation are present", async () => {
  const response = await fetch(`${staticServer.url}/index.html`);
  const html = await response.text();
  const runtimeSource = await readFile(resolve(projectRoot, "src/client/app/module-runtime.ts"), "utf8");
  const overviewSource = await readFile(resolve(projectRoot, "src/client/app/modules/overview.ts"), "utf8");
  const css = await readFile(resolve(projectRoot, "style.css"), "utf8");

  assert.equal(response.status, 200);
  assert.match(html, /id="overview"/u);
  assert.match(html, /Обзор объекта/u);
  assert.match(html, /id="overviewReadinessValue"/u);
  assert.match(html, /<div class="overview-heading">/u);
  assert.doesNotMatch(html, /<header class="overview-heading">/u);
  assert.match(html, /data-tabs-group="inspections"/u);
  assert.match(html, /id="inspectionTabsMenu"/u);
  assert.match(html, /class="tabs-group-item__icon"/u);
  assert.match(html, /data-target="geo"[\s\S]*?<circle cx="12" cy="12" r="3">/u);
  assert.match(html, /data-tab-group="inspections"/u);
  assert.match(html, /id="bottomInspectionMenu"/u);
  assert.match(runtimeSource, /modules\/overview\.js/u);
  assert.match(runtimeSource, /INSPECTION_TARGETS/u);
  assert.match(runtimeSource, /syncDesktopTabState/u);
  assert.match(overviewSource, /loadProjectIssues/u);
  assert.match(overviewSource, /loadProjectControlPlan/u);
  assert.match(overviewSource, /app:project-context-updated/u);
  assert.match(css, /--ui-radius-md:\s*12px/u);
  assert.match(css, /\.overview-metrics/u);
  assert.match(css, /\.tabs-group-menu/u);
  assert.match(css, /\.bottom-nav-group-menu/u);
  assert.match(css, /body\.home-page\.theme-light \.overview-readiness/u);
  assert.match(css, /body\.home-page\.theme-light \.tabs-group-trigger/u);
  assert.match(css, /body\.home-page\.theme-light \.overview-module-row/u);
  assert.match(css, /\.overview-module-row\s*\{[\s\S]*?min-height:\s*58px/u);
  assert.match(css, /body\.home-page \.tabs > \.tab::before/u);
  assert.match(css, /\.tabs-group-item__icon\s*\{/u);
  assert.match(css, /body\.home-page > main\s*\{[\s\S]*?max-width:\s*none/u);
  assert.match(css, /body\.home-page\.theme-light > main\s*\{[\s\S]*?background:\s*#f1f5f9\s*!important/u);
  assert.match(css, /body\.home-page > header,[\s\S]*?body\.profile-edit-page > header\s*\{[\s\S]*?background:\s*#0f172a\s*!important/u);
  assert.match(css, /body\.home-page \.site-footer,[\s\S]*?body\.profile-edit-page \.site-footer\s*\{[\s\S]*?background:\s*#0f172a\s*!important/u);
  assert.match(css, /html\.theme-dark body\.profile-page,[\s\S]*?body\.theme-dark\.profile-page\s*\{[\s\S]*?linear-gradient\(135deg,\s*#1e293b\s*0%,\s*#0f172a\s*100%\)\s*fixed\s*!important/u);
  assert.match(css, /body\.theme-light\.home-page > header,[\s\S]*?body\.theme-light\.profile-edit-page > header\s*\{[\s\S]*?background:\s*#000000\s*!important/u);
  assert.match(css, /body\.theme-light\.home-page \.site-footer,[\s\S]*?body\.theme-light\.profile-edit-page \.site-footer\s*\{[\s\S]*?background:\s*#000000\s*!important/u);
});

test("bim viewer runtime assets are reachable after client build", async () => {
  const assets = [
    "/dist/app/vendor/thatopen-bim-visual-panel.bundle.js",
    "/dist/app/vendor/thatopen-fragments-worker.mjs",
    "/dist/app/vendor/web-ifc.wasm",
    "/dist/app/vendor/ifc-lite_bg.wasm"
  ];

  for (const assetPath of assets) {
    const response = await fetch(`${staticServer.url}${assetPath}`);
    assert.equal(response.status, 200, `Asset should be reachable: ${assetPath}`);
  }
});

test("bim viewer launcher and closed workspace do not block page controls", async () => {
  const response = await fetch(`${staticServer.url}/style.css`);
  const css = await response.text();

  assert.equal(response.status, 200);
  assert.match(css, /\.bim-workspace\[hidden\],[\s\S]*?display:\s*none !important;/);
  assert.match(css, /\.bim-workspace:not\(\[data-open="true"\]\) \*[\s\S]*?pointer-events:\s*none !important;/);
  assert.match(
    css,
    /body\.home-page \.bim-viewer-launcher-slot \.bim-viewer-launcher__button\s*\{[\s\S]*?pointer-events:\s*auto !important;/
  );
});

test("bim viewer receives project and IFC context in every BIM module", async () => {
  const moduleFiles = [
    "src/client/app/modules/geometry.ts",
    "src/client/app/modules/reinforcement.ts",
    "src/client/app/modules/strength.ts"
  ];

  for (const relativePath of moduleFiles) {
    const source = await readFile(resolve(projectRoot, relativePath), "utf8");
    assert.match(source, /getAllElements:\s*\(\)\s*=>/u, `${relativePath} should pass all BIM elements`);
    assert.match(source, /getCurrentProjectId,/u, `${relativePath} should pass current project id`);
    assert.match(source, /getCurrentIfcFile,/u, `${relativePath} should pass current IFC file`);
  }
});

test("client source has no legacy JavaScript copies", async () => {
  const files = await collectFiles(resolve(projectRoot, "src", "client"));
  const jsFiles = files
    .filter((filePath) => filePath.endsWith(".js"))
    .map((filePath) => filePath.replace(`${projectRoot}\\`, "").replaceAll("\\", "/"));

  assert.deepEqual(jsFiles, []);
});

test("client feature data is colocated with its owning module", async () => {
  const legacyRootFiles = ["geom.ts", "reinf.ts", "journal.ts", "summary.ts"];
  const clientFiles = await collectFiles(resolve(projectRoot, "src", "client"));
  const normalizedFiles = clientFiles.map((filePath) => filePath.replaceAll("\\", "/"));

  for (const fileName of legacyRootFiles) {
    assert.ok(
      !normalizedFiles.some((filePath) => filePath.endsWith(`/src/client/${fileName}`)),
      `${fileName} should not return to the client root`
    );
  }

  const featureDataFiles = [
    "app/modules/geometry/data.ts",
    "app/modules/reinforcement/data.ts",
    "app/modules/journal/data.ts",
    "app/modules/summary/data.ts",
    "app/modules/summary/analytics-block.ts"
  ];

  for (const relativePath of featureDataFiles) {
    assert.ok(
      normalizedFiles.some((filePath) => filePath.endsWith(`/src/client/${relativePath}`)),
      `${relativePath} should stay with its owning feature`
    );
  }
});

test("IFC import runtime is not embedded back into app entrypoint", async () => {
  const appSource = await readFile(resolve(projectRoot, "src/client/app.ts"), "utf8");
  const runtimeSource = await readFile(resolve(projectRoot, "src/client/app/ifc-import-runtime.ts"), "utf8");
  const headerSource = await readFile(resolve(projectRoot, "src/client/index-partials/header-shell.html"), "utf8");
  const tailSource = await readFile(resolve(projectRoot, "src/client/index-partials/tail.html"), "utf8");
  const css = await readFile(resolve(projectRoot, "style.css"), "utf8");

  assert.match(appSource, /createIfcImportRuntime/u);
  assert.doesNotMatch(appSource, /importIfcIntoProject/u);
  assert.doesNotMatch(appSource, /deleteImportedBimElements/u);
  assert.doesNotMatch(appSource, /runSingleFlight/u);

  assert.match(runtimeSource, /importIfcIntoProject/u);
  assert.match(runtimeSource, /deleteImportedBimElements/u);
  assert.match(runtimeSource, /runSingleFlight/u);
  assert.match(runtimeSource, /syncImportedIfcCount/u);
  assert.match(appSource, /getImportedIfcCount/u);
  assert.match(headerSource, /id="bimImportedIfcCount"/u);
  assert.match(tailSource, /pointerover/u);
  assert.match(tailSource, /hover: hover/u);
  assert.match(css, /\.help-popover\s*\{[\s\S]*?transition:/u);
  assert.match(css, /@keyframes app-page-reveal/u);
});

test("app entrypoint delegates inspection evaluation and BIM helpers", async () => {
  const appSource = await readFile(resolve(projectRoot, "src/client/app.ts"), "utf8");
  const evaluationSource = await readFile(resolve(projectRoot, "src/client/app/inspection-evaluation.ts"), "utf8");
  const bimUtilsSource = await readFile(resolve(projectRoot, "src/client/app/geo-bim-utils.ts"), "utf8");

  assert.match(appSource, /from "\.\/app\/inspection-evaluation\.js"/u);
  assert.match(appSource, /from "\.\/app\/geo-bim-utils\.js"/u);
  assert.doesNotMatch(appSource, /function evaluateGeoNode/u);
  assert.doesNotMatch(appSource, /function evaluateReinfCheck/u);
  assert.doesNotMatch(appSource, /function normalizeGeoBimSnapshotValue/u);

  assert.match(evaluationSource, /export function evaluateGeoNode/u);
  assert.match(evaluationSource, /export function evaluateReinfCheck/u);
  assert.match(bimUtilsSource, /export function normalizeGeoBimSnapshotValue/u);
  assert.match(bimUtilsSource, /export function formatResolvedLinearAxes/u);
});

test("strip foundation geodesy axis mode selection is not reset on change", async () => {
  const appSource = await readFile(resolve(projectRoot, "src/client/app.ts"), "utf8");
  assert.match(appSource, /geoStripAxisModeEl\?\.addEventListener\("change"/u);
  assert.ok(appSource.includes('resetGeoPlateAxisFields({ axisMode: geoStripAxisModeEl.value || "letter_numbers" });'));
});

test("summary analytics keeps data preparation outside UI block", async () => {
  const uiSource = await readFile(resolve(projectRoot, "src/client/app/modules/summary/analytics-block.ts"), "utf8");
  const dataSource = await readFile(resolve(projectRoot, "src/client/app/modules/summary/analytics-data.ts"), "utf8");
  const coreSource = await readFile(resolve(projectRoot, "src/client/app/modules/summary/analytics-core.ts"), "utf8");

  assert.match(uiSource, /from "\.\/analytics-data\.js"/u);
  assert.match(uiSource, /from "\.\/analytics-core\.js"/u);
  assert.doesNotMatch(uiSource, /function calculateProjectAnalytics/u);
  assert.doesNotMatch(uiSource, /function extractMeasurements/u);
  assert.doesNotMatch(uiSource, /function calculateQualityIndex/u);

  assert.match(dataSource, /export function calculateProjectAnalytics/u);
  assert.match(dataSource, /export function rankProjects/u);
  assert.match(coreSource, /export function calculateQualityIndex/u);
});

test("knowledge runtime imports article data and content helpers", async () => {
  const response = await fetch(`${staticServer.url}/index.html`);
  const html = await response.text();
  const runtimeSource = await readFile(resolve(projectRoot, "src/client/app/modules/knowledge.ts"), "utf8");
  const articlesSource = await readFile(resolve(projectRoot, "src/client/app/modules/knowledge-articles.ts"), "utf8");
  const contentUtilsSource = await readFile(resolve(projectRoot, "src/client/app/modules/knowledge-content-utils.ts"), "utf8");
  const css = await readFile(resolve(projectRoot, "style.css"), "utf8");
  const articleModule = await import(pathToFileURL(resolve(projectRoot, "dist/app/modules/knowledge-articles.js")).href);
  const registryArticles = articleModule.KNOWLEDGE_ARTICLES;

  assert.equal(response.status, 200);
  assert.match(html, /id="normativeAssistant"/u);
  assert.match(html, /Нормативный ассистент/u);
  assert.match(runtimeSource, /from "\.\/knowledge-articles\.js"/u);
  assert.match(runtimeSource, /from "\.\/knowledge-content-utils\.js"/u);
  assert.match(runtimeSource, /initNormativeAssistant/u);
  assert.match(runtimeSource, /formatAssistantDocs/u);
  assert.match(runtimeSource, /data-normative-article-id/u);
  assert.match(runtimeSource, /data-normative-source-article-id/u);
  assert.doesNotMatch(runtimeSource, /"контрольное"/u);
  assert.match(runtimeSource, /Открыть статью/u);
  assert.match(css, /\.wizard-sheet-body \.add-btn-row\s*\{[\s\S]*?margin:\s*16px 0 12px/u);
  assert.match(css, /@keyframes profile-shell-reveal/u);
  assert.doesNotMatch(runtimeSource, /filter\(\(article\) => articleMatchesQuery\(article, rawQuery\)\)\s*\.slice/u);
  assert.match(runtimeSource, /article\.constructionKey === constructionKey/u);
  assert.doesNotMatch(runtimeSource, /articleMatchesQuery\(article,\s*constructionName\s*\|\|\s*constructionKey\)/u);
  assert.doesNotMatch(runtimeSource, /const KNOWLEDGE_ARTICLES\s*=\s*\[/u);
  assert.doesNotMatch(runtimeSource, /function buildKnowledgeList/u);

  assert.match(articlesSource, /export const KNOWLEDGE_ARTICLES/u);
  assert.match(contentUtilsSource, /export function buildExpandedKnowledgeSections/u);
  assert.match(css, /normative-assistant__controls/u);
  assert.match(css, /#btnNormativeAssistantAsk\.lg-btn\s*\{[\s\S]*?height:\s*36px/u);
  assert.match(css, /normative-assistant__status\s*\{[\s\S]*?min-height:\s*22px/u);

  assert.ok(Array.isArray(registryArticles) && registryArticles.length > 0);
  const wallArticles = registryArticles.filter((article) => article.constructionKey === "wall");
  const verticalNeighborArticles = registryArticles.filter((article) =>
    ["column", "pylon", "elevator_shaft"].includes(article.constructionKey)
  );
  assert.equal(wallArticles.length, 4, "Wall construction card should expose only wall module articles");
  assert.ok(verticalNeighborArticles.length >= 4, "Neighbor constructions must exist for filtering regression coverage");
  assert.ok(wallArticles.every((article) => article.title?.includes("Стена")), "Wall card must not include neighbor construction articles");

  const ids = new Set();
  for (const article of registryArticles) {
    assert.ok(article.id, "Knowledge article must expose an id for assistant source links");
    assert.equal(ids.has(article.id), false, `Duplicate knowledge article id: ${article.id}`);
    ids.add(article.id);
    assert.ok(article.constructionKey, `Article ${article.id} must have constructionKey`);
    assert.ok(article.moduleKey, `Article ${article.id} must have moduleKey`);
    assert.ok(Array.isArray(article.fields), `Article ${article.id} must carry registry fields`);
    assert.ok(Array.isArray(article.normativeDocs), `Article ${article.id} must carry registry normative docs`);
  }
});
