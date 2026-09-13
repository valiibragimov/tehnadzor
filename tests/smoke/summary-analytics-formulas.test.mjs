import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");

async function loadAnalyticsCore() {
  return import(pathToFileURL(resolve(projectRoot, "dist/app/modules/summary/analytics-core.js")));
}

test("analytics descriptive statistics use population formulas", async () => {
  const { mean, median, stdDev, coefficientOfVariation } = await loadAnalyticsCore();
  const values = [0, 1, 2];

  assert.equal(mean(values), 1);
  assert.equal(median(values), 1);
  assert.ok(Math.abs(stdDev(values) - Math.sqrt(2 / 3)) < 1e-12);
  assert.ok(Math.abs(coefficientOfVariation(mean(values), stdDev(values)) - Math.sqrt(2 / 3)) < 1e-12);
  assert.equal(coefficientOfVariation(0, 0), 0);
  assert.equal(coefficientOfVariation(0, 1), 1);
});

test("quality index applies documented weights and critical penalty", async () => {
  const { QUALITY_INDEX_WEIGHTS, calculateQualityIndex } = await loadAnalyticsCore();

  assert.equal(QUALITY_INDEX_WEIGHTS.compliance + QUALITY_INDEX_WEIGHTS.stability, 1);
  assert.equal(calculateQualityIndex({ compliancePercent: 100, cv: 0, criticalShare: 0 }), 100);

  const expectedWithoutPenalty = 0.74 * 80 + 0.26 * 100;
  assert.ok(Math.abs(
    calculateQualityIndex({ compliancePercent: 80, cv: 0, criticalShare: 0 }) - expectedWithoutPenalty
  ) < 1e-12);

  const expectedPenalty = 60 * 0.1 + 25 * 0.1 ** 2;
  assert.ok(Math.abs(
    calculateQualityIndex({ compliancePercent: 80, cv: 0, criticalShare: 0.1 }) -
      (expectedWithoutPenalty - expectedPenalty)
  ) < 1e-12);

  assert.equal(calculateQualityIndex({ compliancePercent: 0, cv: 10, criticalShare: 1 }), 0);
});

test("quality index help matches the implemented weights", async () => {
  const template = await readFile(
    resolve(projectRoot, "src/client/app/modules/summary/analytics-block.html"),
    "utf8"
  );

  assert.match(template, /соответствие нормам \(74%\), стабильность замеров \(26%\)/u);
  assert.doesNotMatch(template, /соответствие нормам \(60%\), стабильность замеров \(40%\)/u);
});

test("analytics grades preserve every boundary", async () => {
  const { getGrade } = await loadAnalyticsCore();

  assert.deepEqual(
    [95, 90, 85, 75, 65, 55, 45, 44.99].map(getGrade),
    ["A+", "A", "B+", "B", "C+", "C", "D", "F"]
  );
});
