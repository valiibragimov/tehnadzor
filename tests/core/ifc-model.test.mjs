import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { readIfcModel } = require("../../server/dist/src/shared/bim/ifc-model.js");
const { createIfcWorkerPool } = require("../../server/dist/server/src/services/ifc-worker-pool.js");

import { modelFixture } from "../fixtures/ifc.mjs";

test("WebIFC preserves quoted STEP text, placements, declared geometry and properties", async () => {
  const model = await readIfcModel(modelFixture(), { sourceModelId: "model-a" });
  assert.equal(model.importedCount, 1);
  const element = model.elements[0];
  assert.equal(element.elementId, "model-a_9");
  assert.equal(element.name, "Column; with /* literal */ text");
  assert.deepEqual([element.projectX, element.projectY, element.projectH], [1000, 2000, 3000]);
  assert.deepEqual([element.sectionWidth, element.sectionHeight, element.height], [300, 400, 3000]);
  assert.equal(element.axes, "A-1");
  assert.equal(element.floor, "2");
});

test("unit prefixes are read through IFC entities and missing units are rejected", async () => {
  const model = await readIfcModel(modelFixture(".MILLI."));
  assert.equal(model.elements[0].projectX, 1);
  await assert.rejects(readIfcModel(modelFixture("$", false)), /length unit is missing/);
});

test("bounded Node worker produces the same model and survives a failed import", async () => {
  const pool = createIfcWorkerPool();
  try {
    const bytes = modelFixture();
    const direct = await readIfcModel(bytes, { sourceModelId: "worker" });
    const worker = await pool.parse(bytes, { sourceModelId: "worker" });
    assert.deepEqual(worker, direct);
    await assert.rejects(pool.parse(modelFixture("$", false), {}));
    assert.equal((await pool.parse(bytes, {})).importedCount, 1);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(pool.parse(bytes, {}, controller.signal));
  } finally { await pool.close(); }
});

test("property-specific units override project units without guessing", async () => {
  const source = new TextDecoder().decode(modelFixture()).replace("(#23));", "(#23,#26));");
  const withUnit = source.replace("ENDSEC;\nEND-ISO", "#26=IFCPROPERTYSINGLEVALUE('Height',$,IFCLENGTHMEASURE(2500.),#27);\n#27=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);\nENDSEC;\nEND-ISO");
  const model = await readIfcModel(new TextEncoder().encode(withUnit));
  assert.equal(model.elements[0].height, 2500);
});

test("malformed decimal-comma coordinate tuples are rejected", async () => {
  const source = new TextDecoder().decode(modelFixture()).replace("((1.,2.,3.))", "((1,23.,2,45.,3.))");
  await assert.rejects(readIfcModel(new TextEncoder().encode(source)), /Invalid IFC coordinate tuple/);
});

test("existing source normalization and Unicode filename hashes stay stable", async () => {
  const sourceModelId = "Long_Model-".repeat(7);
  const model = await readIfcModel(modelFixture(), { sourceModelId });
  assert.equal(model.sourceModelId, sourceModelId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48));
  const fileName = "Объект🏗️.ifc";
  let hash = 2166136261;
  for (let index = 0; index < fileName.length; index++) { hash ^= fileName.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  assert.equal((await readIfcModel(modelFixture(), { fileName })).sourceModelId, `ifc-model-${(hash >>> 0).toString(36).slice(0, 6)}`);
});
