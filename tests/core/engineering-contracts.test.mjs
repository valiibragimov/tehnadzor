import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
  export * from './src/client/features/inspections/acceptance.ts';
  export * from './src/client/features/inspections/geodesy/evaluation.ts';
  export { evaluateReinforcementCheck } from './src/client/features/inspections/reinforcement/evaluation.ts';
  export { evaluateGeometryCheck } from './src/client/features/inspections/geometry/evaluation.ts';
  export { evaluateReinfCheck } from './src/client/app/inspection-evaluation.ts';
` }, bundle: true, write: false, platform: "node", format: "esm" });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

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
