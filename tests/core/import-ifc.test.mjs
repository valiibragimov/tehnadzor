import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createIfcImportService } = require("../../server/dist/server/src/application/import-ifc.js");

test("empty or failed IFC parsing never mutates stored elements", async () => {
  let writes = 0;
  const save = async () => { writes++; return { writtenCount: 1, removedCount: 0 }; };
  const empty = createIfcImportService({ parse: async () => ({ importedCount: 0 }), save });
  await assert.rejects(empty("project", new Uint8Array(), {}), { status: 422 });
  const failed = createIfcImportService({ parse: async () => { throw new Error("Invalid IFC"); }, save });
  await assert.rejects(failed("project", new Uint8Array(), {}), /Invalid IFC/);
  assert.equal(writes, 0);
});

test("IFC application service propagates persistence failures and supports a safe retry", async () => {
  const model = { sourceModelId: "model", fileName: "model.ifc", importedCount: 1, elements: [{ elementId: "model_1" }], countsByType: { column: 1 }, schema: "IFC4" };
  let fail = true;
  const execute = createIfcImportService({ parse: async () => model, save: async () => {
    if (fail) throw new Error("Storage unavailable");
    return { writtenCount: 1, removedCount: 0 };
  } });
  await assert.rejects(execute("project", new Uint8Array(), {}), /Storage unavailable/);
  fail = false;
  assert.equal((await execute("project", new Uint8Array(), {})).importedCount, 1);
});
