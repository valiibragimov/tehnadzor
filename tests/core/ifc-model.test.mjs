import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { readIfcModel } = require("../../server/dist/src/shared/bim/ifc-model.js");
const { createIfcWorkerPool } = require("../../server/dist/server/src/services/ifc-worker-pool.js");

import { modelFixture, engineeringFixtures } from "../fixtures/ifc.mjs";

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


test("beam axis includes solid placement, profile origin and extrusion direction", async () => {
  const source = new TextDecoder().decode(modelFixture())
    .replace("IFCCOLUMN(", "IFCBEAM(").replace(".COLUMN.", ".BEAM.")
    .replace("#10=IFCCARTESIANPOINT((0.,0.))", "#10=IFCCARTESIANPOINT((0.5,0.25))")
    .replace("#14=IFCCARTESIANPOINT((0.,0.,0.))", "#14=IFCCARTESIANPOINT((10.,20.,30.))")
    .replace("#13=IFCDIRECTION((0.,0.,1.))", "#13=IFCDIRECTION((0.,1.,0.))")
    .replace("#15=IFCAXIS2PLACEMENT3D(#14,$,$)", "#15=IFCAXIS2PLACEMENT3D(#14,#30,#31)")
    .replace("ENDSEC;\nEND-ISO", "#30=IFCDIRECTION((1.,0.,0.));\n#31=IFCDIRECTION((0.,1.,0.));\nENDSEC;\nEND-ISO");
  const element = (await readIfcModel(new TextEncoder().encode(source))).elements[0];
  assert.deepEqual([element.projectX, element.projectY, element.projectH], [1000, 2000, 3000]);
  assert.deepEqual([element.lineStartX, element.lineStartY, element.lineStartH], [11000, 22500, 33250]);
  assert.deepEqual([element.lineEndX, element.lineEndY, element.lineEndH], [11000, 22500, 36250]);
  assert.deepEqual([element.directionX, element.directionY], [0, 0]);
});

test("wall placement and length do not invent an engineering centreline", async () => {
  const source = new TextDecoder().decode(modelFixture()).replace("IFCCOLUMN(", "IFCWALL(").replace(".COLUMN.", ".STANDARD.");
  const element = (await readIfcModel(new TextEncoder().encode(source))).elements[0];
  assert.equal(element.lineStartX, null);
  assert.equal(element.lineEndX, null);
  assert.equal(element.directionX, null);
});

test("IFC element limits reject excess instead of returning a truncated model", async () => {
  const source = new TextDecoder().decode(modelFixture()).replace("ENDSEC;\nEND-ISO", "#29=IFCCOLUMN('1BBCDEFGHIJKLMNOPQRSTU',$,'Second',$,$,#8,#20,'C-2',.COLUMN.);\nENDSEC;\nEND-ISO");
  await assert.rejects(readIfcModel(new TextEncoder().encode(source), { maxElements: 1 }), /exceeds the supported limit/);
  await assert.rejects(readIfcModel(modelFixture(), { maxElements: 0 }), /Invalid IFC element limit/);
});

test("caller cancellation does not disable the worker deadline", async () => {
  const previous = process.env.IFC_WORKER_TIMEOUT_MS;
  process.env.IFC_WORKER_TIMEOUT_MS = "1";
  const pool = createIfcWorkerPool();
  try {
    await assert.rejects(pool.parse(modelFixture(), {}, new AbortController().signal), /execution limit/);
  } finally {
    await pool.close();
    if (previous === undefined) delete process.env.IFC_WORKER_TIMEOUT_MS;
    else process.env.IFC_WORKER_TIMEOUT_MS = previous;
  }
});


test("worker rejects oversized input before scheduling CPU work", async () => {
  const previous = process.env.IFC_WORKER_MAX_BYTES;
  process.env.IFC_WORKER_MAX_BYTES = "32";
  const pool = createIfcWorkerPool();
  try {
    await assert.rejects(pool.parse(modelFixture(), {}), { status: 413 });
    assert.equal(pool.queueSize, 0);
  } finally {
    await pool.close();
    if (previous === undefined) delete process.env.IFC_WORKER_MAX_BYTES;
    else process.env.IFC_WORKER_MAX_BYTES = previous;
  }
});


test("valid unsupported grid placements preserve elements with unknown coordinates", async () => {
  const source = new TextDecoder().decode(modelFixture()).replace("#8=IFCLOCALPLACEMENT($,#4);", "#8=IFCGRIDPLACEMENT(#30,$);\n#30=IFCVIRTUALGRIDINTERSECTION((#31,#32),(0.,0.));\n#31=IFCGRIDAXIS('A',#33,.T.);\n#32=IFCGRIDAXIS('1',#33,.T.);\n#33=IFCPOLYLINE((#5,#14));");
  const element = (await readIfcModel(new TextEncoder().encode(source))).elements[0];
  assert.deepEqual([element.projectX, element.projectY, element.projectH], [null, null, null]);
  assert.equal(element.sectionWidth, 300);
  assert.equal(element.axes, "A-1");
});

test("exporter-shaped bodies preserve engineering accuracy without mesh-bound guesses", async () => {
  const fixtures = engineeringFixtures();
  const body = (await readIfcModel(fixtures.bodyAndAxis)).elements[0];
  assert.deepEqual([body.sectionWidth, body.sectionHeight, body.height], [300, 400, 3000]);
  const nested = (await readIfcModel(fixtures.nestedRotation)).elements[0];
  assert.deepEqual([nested.projectX, nested.projectY, nested.projectH], [3999998000, 5000001000, 103000]);
  const pool = createIfcWorkerPool();
  try {
    for (const [name, bytes] of Object.entries(fixtures)) {
      const direct = await readIfcModel(bytes, { sourceModelId: name.toLowerCase() });
      assert.deepEqual(await pool.parse(bytes, { sourceModelId: name.toLowerCase() }), direct);
      if (["mappedBody", "booleanBody"].includes(name)) {
        assert.equal(direct.elements[0].sectionWidth, null, name);
        assert.equal(direct.elements[0].lineEndX, null, name);
        assert.equal(direct.elements[0].axes, "A-1");
      }
    }
  } finally { await pool.close(); }
});
