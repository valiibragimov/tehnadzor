import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
  export * from './src/client/features/inspections/acceptance.ts';
  export * from './src/client/features/inspections/geodesy/evaluation.ts';
  export { evaluateReinforcementCheck } from './src/client/features/inspections/reinforcement/evaluation.ts';
  export { evaluateGeometryCheck } from './src/client/features/inspections/geometry/evaluation.ts';
  export * from './src/client/features/inspections/strength/evaluation.ts';
  export * from './src/client/app/construction.ts';
  export * from './src/client/app/inspection-registry.ts';
  export { evaluateReinfCheck } from './src/client/app/inspection-evaluation.ts';
` }, bundle: true, write: false, platform: "node", format: "esm" });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

test("unknown registry keys cannot resolve inherited object properties", () => {
  for (const key of ["constructor", "__proto__", "not-a-construction"]) {
    assert.equal(api.getConstructionInspectionConfig(key), null);
    assert.equal(api.getConstructionModuleInspectionConfig(key, "geometry"), null);
  }
  assert.equal(api.getConstructionEntityLabels("not-a-construction").singular.length > 0, true);
});

test("legacy construction aliases retain registry applicability and fallback labels", () => {
  for (const key of ["column", "wall", "floor_slab", "pile_grillage"]) {
    const label = api.getConstructionLabel(key);
    assert.equal(api.normalizeConstructionKey(label), key);
    assert.equal(api.getConstructionInspectionConfig(key).construction, key);
  }
  assert.equal(api.getInspectionStatus("pile_grillage", "reinforcement", "screw_piles", "pile"), "factory");
  assert.equal(api.getInspectionStatus("pile_grillage", "reinforcement", "bored_piles", "pile"), "object");
});

test("runtime config keeps typed overrides and rejects malformed override containers", async () => {
  const configBundle = await build({ entryPoints: ["src/client/config.ts"], bundle: true, write: false, platform: "node", format: "esm" });
  const url = `data:text/javascript;base64,${Buffer.from(configBundle.outputFiles[0].text).toString("base64")}`;
  const previous = Object.getOwnPropertyDescriptor(globalThis, "__APP_CONFIG__");
  try {
    globalThis.__APP_CONFIG__ = { BIM_IMPORT_API_BASE: " https://example.invalid/api ", IFC_IMPORT_TIMEOUT_MS: "30000" };
    const overridden = await import(url + "#overridden");
    assert.equal(overridden.APP_CONFIG.BIM_IMPORT_API_BASE, "https://example.invalid/api");
    assert.equal(overridden.APP_CONFIG.IFC_IMPORT_TIMEOUT_MS, 30000);
    for (const value of [null, false, "invalid", []]) {
      globalThis.__APP_CONFIG__ = value;
      const fallback = await import(url + "#" + JSON.stringify(value));
      assert.equal(fallback.APP_CONFIG.IFC_IMPORT_TIMEOUT_MS, 120000);
      assert.equal(fallback.APP_CONFIG.BIM_IMPORT_API_BASE, "");
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, "__APP_CONFIG__", previous);
    else delete globalThis.__APP_CONFIG__;
  }
});

test("strict evaluators preserve concrete class parsing and ordered opening pairs", () => {
  assert.equal(api.parseConcreteStrengthValue("B25"), 25);
  assert.equal(api.parseConcreteStrengthValue("B12,5"), 12.5);
  assert.equal(api.parseConcreteStrengthValue("M350"), null);
  assert.equal(api.evaluateStrengthCheck({ construction: "floor_slab", mark: "B25", days: 28, actual: 30 }).status, "empty");
  const acceptanceCriteria = { confirmed: true, reference: "Synthetic drawing", limits: { dimensions: { min: -5, max: 5 }, thickness: { min: -5, max: 5 }, flatness: { min: 0, max: 5 }, opening: { min: -5, max: 5 } } };
  const check = { construction: "floor_slab", physicalDimensions: { length: { project: 6000, actual: 6000 }, width: { project: 4000, actual: 4000 } }, projPlateHeight: 200, factPlateHeight: 200, factPlateFlatness: 0, projOpeningSizes: "1200x900;800x2100", factOpeningSizes: "1200x900;800x2100", acceptanceCriteria };
  assert.equal(api.evaluateGeometryCheck(check).status, "ok");
  assert.equal(api.evaluateGeometryCheck({ ...check, factOpeningSizes: "1200" }).status, "empty");
  assert.equal(api.evaluateGeometryCheck({ ...check, factOpeningSizes: "800x2100;1200x900" }).status, "exceeded");
});

test("blank and nonfinite geodesy measurements never become confirmed zero coordinates", () => {
  for (const value of [" ", "\t", null, undefined, NaN, Infinity]) {
    const result = api.evaluateGeoNode({ projX: value, factX: value, projY: value, factY: value, projH: value, factH: value }, 8, 10);
    assert.equal(result.status, "empty", String(value));
    assert.equal(result.hasAllData, false);
  }
  assert.equal(api.evaluateGeoNode({ projX: 0, factX: 0, projY: 0, factY: 0, projH: 0, factH: 0 }, 8, 10).status, "ok");
});

test("metre coordinates and signed millimetre limits retain boundary precision", () => {
  const node = { projX: 1, factX: 1.008, projY: 2, factY: 2, projH: 100, factH: 99.98 };
  assert.equal(api.evaluateGeoNode(node, 8, { min: -20, max: 0 }).status, "ok");
  assert.equal(api.evaluateGeoNode({ ...node, factX: 1.0081 }, 8, { min: -20, max: 0 }).status, "bad");
  assert.equal(api.evaluateGeoNode(node, 8, { min: 1, max: -1 }).status, "empty");
});

test("confirmed physical tolerances are signed mm and require positive complete dimensions", () => {
  const criteria = { reference: "Synthetic drawing", confirmed: true, limits: { cover: { min: -2, max: 5 } } };
  assert.equal(api.comparePhysicalMeasurement("30,0", "28", "cover", criteria), "ok");
  assert.equal(api.comparePhysicalMeasurement(30, 35, "cover", criteria), "ok");
  assert.equal(api.comparePhysicalMeasurement(30, 35.1, "cover", criteria), "exceeded");
  assert.equal(api.comparePhysicalMeasurement(0, 0, "cover", criteria), "incomplete");
  assert.equal(api.comparePhysicalMeasurement(null, 30, "cover", criteria), "incomplete");
  assert.equal(api.comparePhysicalMeasurement(30, 30, "cover", { ...criteria, confirmed: false }), "unverified");
});

test("pile subtypes and reinforcement legacy API keep one engineering evaluator", () => {
  assert.equal(api.evaluateReinfCheck, api.evaluateReinforcementCheck);
  const acceptanceCriteria = { reference: "Synthetic drawing", confirmed: true, limits: { cover: { min: -2, max: 2 }, step: { min: -5, max: 5 }, hoopsStep: { min: -5, max: 5 } } };
  const check = { construction: "pile_grillage", constructionSubtype: "screw_piles", constructionPileElement: "pile", projDia: 12, factDia: 12, projCover: 30, factCover: 30, projHoopsStep: 100, factHoopsStep: 100, acceptanceCriteria };
  assert.equal(api.evaluateReinforcementCheck(check).status, "empty", "steel screw pile is not a concrete reinforcement inspection");
  assert.equal(api.evaluateReinforcementCheck({ ...check, constructionSubtype: "bored_piles" }).status, "ok");
  assert.equal(api.evaluateReinforcementCheck({ ...check, constructionSubtype: "bored_piles", factCover: null }).status, "empty");
  assert.equal(api.evaluateGeometryCheck({ construction: "beam", beams: [{ projBeamWidth: 300, factBeamWidth: 300 }], acceptanceCriteria }).status, "empty");
});
