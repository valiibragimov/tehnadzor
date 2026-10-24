import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { reportRequestSchema, ifcImportQuerySchema } = require("../../server/dist/server/src/http-contract.js");
const { buildReportText } = require("../../server/dist/server/src/presentation/report-text.js");
const spec = JSON.parse(await readFile(new URL("../../api/openapi.json", import.meta.url), "utf8"));

test("OpenAPI enumerates every owned HTTP operation and its auth policy", () => {
  const secured = ["/generateReport", "/bim/import-ifc", "/bim/elements", "/documents/upload", "/documents/file"];
  for (const path of secured) {
    const operation = Object.values(spec.paths[path])[0];
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    assert.ok(operation.responses[401]);
    assert.ok(operation.responses[503]);
  }
  assert.ok(spec.paths["/profileFeed"].get.responses[405]);
});

test("report validation enforces domain limits before rendering", () => {
  const stats = { total: 2, exceeded: 1 };
  const input = { projectId: "project", summaryData: { project: "Test project", geo: stats, reinf: stats, geom: stats, strength: stats } };
  const parsed = reportRequestSchema.parse(input);
  assert.match(buildReportText(parsed.summaryData), /Итого количество выполненных проверок: 8/u);
  input.summaryData.geo = { total: 2, exceeded: 3 };
  assert.equal(reportRequestSchema.safeParse(input).success, false);
  assert.equal(ifcImportQuerySchema.safeParse({ projectId: "" }).success, false);
});
