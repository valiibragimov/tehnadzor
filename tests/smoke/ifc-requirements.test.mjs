import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");

async function loadRequirements() {
  return import(pathToFileURL(resolve(projectRoot, "dist/app/services/ifc-requirements.js")));
}

const validEnvelope = `
  ISO-10303-21;
  HEADER;
  FILE_SCHEMA(('IFC4'));
  ENDSEC;
  DATA;
  ENDSEC;
  END-ISO-10303-21;
`;

function createValidElement(overrides = {}) {
  return {
    elementId: "sample_42",
    ifcGuid: "0ABCDEFGHIJKLMNOPQRSTU",
    type: "column",
    name: "Колонна К1",
    floor: "1",
    axes: "А-1",
    mark: "К1",
    projectX: 1000,
    projectY: 2000,
    projectH: 0,
    ...overrides
  };
}

test("IFC requirements pass a complete structural element", async () => {
  const { analyzeIfcRequirements } = await loadRequirements();
  const summary = analyzeIfcRequirements(validEnvelope, [createValidElement()]);

  assert.equal(summary.status, "passed");
  assert.equal(summary.canImport, true);
  assert.equal(summary.score, 100);
  assert.equal(summary.conformingElements, 1);
  assert.equal(summary.checks.every((check) => check.passed), true);
});

test("IFC requirements warn about numeric names, missing levels and axes before import", async () => {
  const { analyzeIfcRequirements } = await loadRequirements();
  const summary = analyzeIfcRequirements(validEnvelope, [
    createValidElement({
      name: "454425.1027891.979946",
      floor: null,
      axes: null,
      mark: null
    })
  ]);

  assert.equal(summary.status, "warning");
  assert.equal(summary.canImport, true);
  assert.ok(summary.score < 100);
  assert.equal(summary.conformingElements, 0);
  assert.equal(summary.checks.find((check) => check.id === "name")?.affectedCount, 1);
  assert.equal(summary.checks.find((check) => check.id === "floor")?.affectedCount, 1);
  assert.equal(summary.checks.find((check) => check.id === "axes")?.affectedCount, 1);
});

test("IFC requirements block a file without a STEP envelope", async () => {
  const { analyzeIfcRequirements } = await loadRequirements();
  const summary = analyzeIfcRequirements("not an IFC file", [createValidElement()]);

  assert.equal(summary.status, "blocked");
  assert.equal(summary.canImport, false);
  assert.equal(summary.errorCount, 1);
});

test("viewer source uses one conceptual material and automatic display normalization", async () => {
  const engineSource = await readFile(
    resolve(projectRoot, "src/client/app/vendor-src/ifc-lite-engine.ts"),
    "utf8"
  );
  const panelSource = await readFile(
    resolve(projectRoot, "src/client/app/vendor-src/thatopen-bim-visual-panel.ts"),
    "utf8"
  );

  assert.match(engineSource, /const CONCEPT_MODEL_COLOR = new THREE\.Color/u);
  assert.match(engineSource, /function createConceptMaterial\(\)/u);
  assert.match(engineSource, /return createConceptMaterial\(\);/u);
  assert.match(engineSource, /powerPreference:\s*"high-performance"/u);
  assert.match(engineSource, /renderer\.toneMapping = THREE\.NoToneMapping/u);
  assert.match(engineSource, /orbitControls\.dampingFactor = 0\.16/u);
  assert.match(engineSource, /if \(renderDirty \|\| resized \|\| cameraChanged\)/u);
  assert.doesNotMatch(engineSource, /SELECT_COLOR|refreshSelectionVisuals/u);
  assert.doesNotMatch(panelSource, /SELECT_COLOR|refreshSelectionVisuals/u);
  assert.doesNotMatch(panelSource, /bim-visual-legend|buildLegendHtml/u);
  assert.match(panelSource, /let normalizationRequested = true;/u);
});

test("BIM workspace CSS removes desktop minimum height that clips the viewer", async () => {
  const css = await readFile(resolve(projectRoot, "style.css"), "utf8");

  assert.match(
    css,
    /\.bim-workspace__body,[\s\S]*?\.bim-workspace__stage--3d\s*\{[\s\S]*?min-height:\s*0 !important;/u
  );
  assert.match(css, /\.bim-workspace__surface\s*\{[\s\S]*?env\(safe-area-inset-top/u);
  assert.doesNotMatch(css, /bim-visual-legend|bim-workspace__legend/u);
});

test("IFC dialog and BIM controls keep responsive layout and light-theme contrast", async () => {
  const css = await readFile(resolve(projectRoot, "style.css"), "utf8");

  assert.doesNotMatch(css, /^\s*header(?:\.header-hidden)?\s*\{/mu);
  assert.match(css, /^body > header\s*\{/mu);
  assert.match(css, /^body\.theme-light > header\s*\{/mu);
  assert.match(css, /\.ifc-check-modal__content\s*\{[\s\S]*?max-width:\s*calc\(100vw - 28px\)/u);
  assert.match(
    css,
    /\.ifc-check-modal__header\s*\{[\s\S]*?display:\s*block[\s\S]*?padding-right:\s*160px/u
  );
  assert.match(css, /\.ifc-check-modal__content > \*\s*\{[\s\S]*?width:\s*100%[\s\S]*?max-width:\s*none/u);
  assert.doesNotMatch(css, /\.ifc-check-modal__header > \*,[\s\S]*?max-width:\s*100%/u);
  assert.match(css, /\.ifc-check-modal__footer > button,[\s\S]*?min-width:\s*0 !important/u);
  assert.match(
    css,
    /body\.theme-light \.bim-workspace__action[\s\S]*?background:\s*#eff6ff !important[\s\S]*?color:\s*#1e3a8a !important/u
  );
  assert.match(
    css,
    /@media \(max-width: 768px\)[\s\S]*?\.bim-workspace__actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) !important/u
  );
});
