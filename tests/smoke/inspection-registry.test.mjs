import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");

async function importDist(relativePath) {
  return import(pathToFileURL(resolve(projectRoot, relativePath)).href);
}

test("inspection registry controls formwork applicability and knowledge articles", async () => {
  const registry = await importDist("dist/app/inspection-registry.js");
  const { KNOWLEDGE_ARTICLES } = await importDist("dist/app/modules/knowledge-articles.js");

  assert.equal(registry.getInspectionStatus("formwork", "geodesy"), "notApplicable");
  assert.equal(registry.getInspectionStatus("formwork", "reinforcement"), "notApplicable");
  assert.equal(registry.getInspectionStatus("formwork", "geometry"), "object");
  assert.equal(registry.getInspectionStatus("formwork", "strength"), "notApplicable");

  const formworkArticles = KNOWLEDGE_ARTICLES.filter((article) => article.constructionKey === "formwork");
  assert.deepEqual(formworkArticles.map((article) => article.moduleKey), ["geometry"]);
  assert.deepEqual(
    formworkArticles[0].normativeDocs.map((doc) => doc.document),
    ["СП 371.1325800.2017", "ГОСТ 34329-2017", "СП 70.13330.2012"]
  );
});

test("construction behavior is driven by registry field behavior for key migrated cases", async () => {
  const construction = await importDist("dist/app/construction.js");

  const pylonGeometry = construction.getConstructionModuleBehavior("pylon", "geometry");
  assert.equal(pylonGeometry.profile, "wall");
  assert.equal(pylonGeometry.elementSheetMode, "walls");
  assert.equal(construction.getConstructionEntityLabels("pylon", "geometry").singular, "Пилон");
  assert.equal(construction.getConstructionEntityLabels("pylon", "geometry").pluralGenitive, "пилонов");

  const beamGeodesy = construction.getConstructionModuleBehavior("beam", "geo");
  assert.equal(beamGeodesy.locationMode, "strip_foundation");

  const foundationSlabGeodesy = construction.getConstructionModuleBehavior("foundation_slab", "geo");
  assert.equal(foundationSlabGeodesy.locationMode, "plate_range");

  const stripFoundationGeodesy = construction.getConstructionModuleBehavior("strip_foundation", "geo");
  assert.equal(stripFoundationGeodesy.locationMode, "strip_foundation");

  const pileGrillageGeodesy = construction.getConstructionModuleBehavior("pile_grillage", "geo", "bored_piles");
  assert.equal(pileGrillageGeodesy.locationMode, "plate_range");

  const stairCore = construction.getConstructionModuleBehavior("stair_core", "geometry");
  assert.equal(stairCore.showOpeningPoints, false);
  assert.equal(stairCore.showStairName, true);

  const elevatorShaft = construction.getConstructionModuleBehavior("elevator_shaft", "geometry");
  assert.equal(elevatorShaft.showOpeningPoints, true);
  assert.equal(elevatorShaft.maxWalls, 4);
});

test("pile subtype statuses distinguish object and factory control", async () => {
  const registry = await importDist("dist/app/inspection-registry.js");

  assert.equal(registry.getInspectionStatus("pile_grillage", "reinforcement", "bored_piles"), "object");
  assert.equal(registry.getInspectionStatus("pile_grillage", "geometry", "bored_piles"), "object");
  assert.equal(registry.getInspectionStatus("pile_grillage", "reinforcement", "precast_rc_piles"), "factory");
  assert.equal(registry.getInspectionStatus("pile_grillage", "geometry", "precast_rc_piles"), "factory");
  assert.equal(registry.getInspectionStatus("pile_grillage", "reinforcement", "screw_piles"), "factory");
  assert.equal(registry.getInspectionStatus("pile_grillage", "geometry", "screw_piles"), "factory");
});
