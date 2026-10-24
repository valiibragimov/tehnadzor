import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGeoNode, evaluateGeoColumnNode } from "../../dist/features/inspections/geodesy/evaluation.js";

test("geodesy compares metre coordinates against millimetre limits", () => {
  const result = evaluateGeoNode({ projX: 10, factX: 10.009, projY: 5, factY: 5, projH: 100, factH: 100.011 }, 8, 10);
  assert.equal(result.status, "bad");
  assert.ok(Math.abs(result.details[0].dev - 9) < 1e-8);
  assert.ok(Math.abs(result.details[2].dev - 11) < 1e-8);
  assert.equal(evaluateGeoColumnNode([{ projX: "10", factX: "10.008", projY: "5", factY: "5" }], 8).status, "ok");
});

const { evaluateReinforcementCheck } = await import("../../dist/features/inspections/reinforcement/evaluation.js");
test("one complete reinforcement pair cannot pass an incomplete inspection", () => {
  assert.equal(evaluateReinforcementCheck({ construction: "floor_slab", projDia: 12, factDia: 12 }).status, "empty");
});

const { evaluateStrengthCheck } = await import("../../dist/features/inspections/strength/evaluation.js");
test("a strength measurement above a curing estimate is not normative acceptance", () => {
  assert.equal(evaluateStrengthCheck({ mark: "B25", days: 7, actual: 30 }).status, "empty");
});

test("reinforcement cannot accept complete measurements using unconfirmed universal limits", () => {
  assert.equal(evaluateReinforcementCheck({ construction: "floor_slab", projDia: 12, factDia: 12, projStep: 200, factStep: 210, projCover: 30, factCover: 30, projHoopsStep: 100, factHoopsStep: 100 }).status, "empty");
});

const { evaluateGeometryCheck } = await import("../../dist/features/inspections/geometry/evaluation.js");
test("geometry does not accept a beam with only one section dimension measured", () => {
  assert.equal(evaluateGeometryCheck({ construction: "beam", beams: [{ projBeamWidth: 300, factBeamWidth: 300 }] }).status, "empty");
});

test("single-point geodesy needs elevation as well as plan coordinates", () => {
  assert.equal(evaluateGeoNode({ projX: 1, factX: 1, projY: 2, factY: 2, projH: null, factH: null }, 8, 10).status, "empty");
});

test("concrete conclusions cannot accept formwork or a steel screw pile", () => {
  const evidence = { mark: "B25", days: 28, actual: 35, assessment: { confirmed: true, reference: "Laboratory report 17, assessed class B25", responsible: "Laboratory engineer", date: "2026-10-20", verdict: "conforms" } };
  assert.equal(evaluateStrengthCheck({ ...evidence, construction: "formwork" }).status, "empty");
  assert.equal(evaluateStrengthCheck({ ...evidence, construction: "pile_grillage", constructionSubtype: "screw_piles", constructionPileElement: "pile" }).status, "empty");
  assert.equal(evaluateStrengthCheck({ ...evidence, construction: "pile_grillage", constructionSubtype: "screw_piles", constructionPileElement: "grillage" }).status, "ok");
});

test("geodesy respects signed asymmetric elevation limits", () => {
  const node = { projX: 1, factX: 1, projY: 2, factY: 2, projH: 100, factH: 99.985 };
  assert.equal(evaluateGeoNode(node, 8, { min: -20, max: 0 }).status, "ok");
  assert.equal(evaluateGeoNode({ ...node, factH: 100.001 }, 8, { min: -20, max: 0 }).status, "bad");
});
