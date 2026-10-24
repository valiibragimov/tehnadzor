import { build } from "esbuild";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";
import SwaggerParser from "@apidevtools/swagger-parser";

const require = createRequire(import.meta.url);
const { z } = require("../../server/node_modules/zod");
const bundled = await build({ entryPoints: ["server/src/http-contract.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external" });
const contractModule = { exports: {} };
new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(new URL("../../server/package.json", import.meta.url)), contractModule, contractModule.exports);
const { reportRequestSchema, ifcImportQuerySchema, bimDeleteQuerySchema, documentUploadQuerySchema } = contractModule.exports;
const schema = (value) => { const result = z.toJSONSchema(value, { target: "draft-7" }); delete result.$schema; return result; };
const json = (schema) => ({ "application/json": { schema } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const error = { description: "Request failed", content: json(ref("ApiError")) };
const responses = (name, secured = false) => ({ 200: { description: "Success", content: json(ref(name)) }, 400: error, ...(secured ? { 401: error, 403: error, 404: error, 409: error, 413: error, 422: error, 429: error, 503: error } : {}), 500: error });
const query = (validator) => { const model = schema(validator); return Object.entries(model.properties).map(([name, property]) => ({ name, in: "query", required: (model.required || []).includes(name), schema: property })); };
const object = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required });
const string = { type: "string" }, integer = { type: "integer", minimum: 0 }, ok = { type: "boolean", const: true };
const counts = { type: "object", additionalProperties: integer };
const feedItem = object({});
feedItem.properties = { ...Object.fromEntries(["id", "section", "category", "categoryLabel", "title", "summary", "sourceLabel", "sourceUrl", "url"].map(k => [k, string])), publishedAt: { type: ["string", "null"] }, publishedLabel: { type: ["string", "null"] } };
feedItem.required = Object.keys(feedItem.properties);
const feed = object({ ok, generatedAt: string, sections: object({ regulatory: { type: "array", items: feedItem }, industry: { type: "array", items: feedItem } }), sources: { type: "array", items: object({ id: string, label: string, status: { type: "string", enum: ["ok", "error"] }, itemsCount: integer, error: string }, ["id", "label", "status", "itemsCount"]) }, cache: object({ hit: { type: "boolean" }, expiresAt: string }) });
const document = {
  openapi: "3.1.0", info: { title: "Tehnadzor HTTP API", version: "1.0.0" },
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Firebase ID token" } }, schemas: {
    ApiError: object({ ok: { type: "boolean", const: false }, error: string, details: { type: "array", items: object({ path: string, message: string }) } }, ["ok", "error"]),
    DocumentUploadResponse: object({ ok, versionId: string }),
    ReportRequest: schema(reportRequestSchema), ReportResponse: object({ ok, text: string }),
    HealthResponse: object({ ok, status: { type: "string", const: "running" }, port: integer }),
    IfcImportResponse: object({ ok, projectId: string, sourceModelId: string, fileName: string, importedCount: integer, replacedCount: integer, countsByType: counts, countsByLabel: counts }),
    BimDeleteResponse: object({ ok, projectId: string, sourceModelId: { type: ["string", "null"] }, deletedCount: integer }), ProfileFeedResponse: feed
  } },
  paths: {
    "/health": { get: { operationId: "health", responses: responses("HealthResponse") } },
    "/generateReport": { post: { operationId: "generateReport", security: [{ bearerAuth: [] }], requestBody: { required: true, content: json(ref("ReportRequest")) }, responses: responses("ReportResponse", true) } },
    "/bim/import-ifc": { post: { operationId: "importIfc", security: [{ bearerAuth: [] }], parameters: query(ifcImportQuerySchema), requestBody: { required: true, content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }, responses: responses("IfcImportResponse", true) } },
    "/bim/elements": { delete: { operationId: "deleteBimElements", security: [{ bearerAuth: [] }], parameters: query(bimDeleteQuerySchema), responses: responses("BimDeleteResponse", true) } },
    "/documents/file": { get: { operationId: "downloadDocument", security: [{ bearerAuth: [] }], parameters: query(documentUploadQuerySchema), responses: { ...responses("DocumentUploadResponse", true), 200: { description: "Authenticated PDF attachment", content: { "application/pdf": { schema: { type: "string", format: "binary" } } } } } } },
    "/documents/upload": { post: { operationId: "uploadDocument", security: [{ bearerAuth: [] }], parameters: query(documentUploadQuerySchema), requestBody: { required: false, content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }, responses: responses("DocumentUploadResponse", true) } },
    "/profile-feed": { get: { operationId: "profileFeed", responses: responses("ProfileFeedResponse") } },
    "/profileFeed": { get: { operationId: "profileFeedFunction", description: "Firebase Functions entry point", responses: { ...responses("ProfileFeedResponse"), 405: error } } }
  }
};
await SwaggerParser.validate(structuredClone(document));
const routes = {};
for (const [path, methods] of Object.entries(document.paths)) for (const operation of Object.values(methods)) routes[operation.operationId] = path;
const routeSource = `// Generated by npm run api:generate. Do not edit.\nexport const API_ROUTES = ${JSON.stringify(routes, null, 2)} as const;\n`;
const types = astToString(await openapiTS(document));
const artifacts = { "api/openapi.json": JSON.stringify(document, null, 2) + "\n", "src/shared/api-schema.d.ts": types, "src/shared/api-routes.ts": routeSource, "src/client/infrastructure/api/routes.ts": routeSource };
const check = process.argv.includes("--check");
for (const [path, content] of Object.entries(artifacts)) {
  if (check) { if (await readFile(path, "utf8").catch(() => "") !== content) throw new Error(`Stale API artifact: ${path}. Run npm run api:generate.`); }
  else { await mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true }); await writeFile(path, content); }
}
console.log(check ? "API contract and generated artifacts match." : "API contract, types and route identifiers generated.");
