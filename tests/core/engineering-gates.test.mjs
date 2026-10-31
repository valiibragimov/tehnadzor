import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

test("engineering evaluation rejects storage, UI, dynamic dependencies and explicit any", () => {
  const filename = "src/client/features/inspections/geodesy/evaluation.ts";
  for (const [source, rule] of [
    ['import { db } from "../../../firebase.js";', "no-restricted-imports"],
    ['export { save } from "../../../app/repositories/firestore-repository.js";', "no-restricted-imports"],
    ['import { show } from "../../../app/ui/dialog.js";', "no-restricted-imports"],
    ['import { getDoc } from "firebase/firestore";', "no-restricted-imports"],
    ['import type { Client } from "../../../infrastructure/client.js";', "no-restricted-imports"],
    ['const dependency = import("../../../firebase.js");', "no-restricted-syntax"],
    ['const dependency = require("../../../firebase.js");', "no-restricted-syntax"],
    ['export const view = document;', "no-restricted-globals"],
    ['export const view = globalThis.document;', "no-restricted-globals"],
    ['export const view = self["document"];', "no-restricted-globals"],
    ['export function unsafe(value: string | null) { return value!; }', "@typescript-eslint/no-non-null-assertion"],
    ['export function unsafe(value: any) { return value; }', "@typescript-eslint/no-explicit-any"]
  ]) {
    const result = spawnSync(process.execPath, ["node_modules/eslint/bin/eslint.js", "--stdin", "--stdin-filename", filename, "--format", "json"], { input: source, encoding: "utf8" });
    assert.equal(result.status, 1, source);
    const diagnostics = JSON.parse(result.stdout).flatMap(file => file.messages);
    assert.ok(diagnostics.some(message => message.ruleId === rule), source);
  }
});

test("engineering strict profile checks real modules and rejects unsafe TypeScript", async () => {
  const profile = resolve("tsconfig.engineering.json");
  const control = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", profile], { encoding: "utf8" });
  assert.equal(control.status, 0, control.stdout + control.stderr);
  const directory = await mkdtemp(join(tmpdir(), "engineering-strict-"));
  try {
    const registryPath = resolve("src/client/app/inspection-registry.js").replaceAll("\\", "/");
    await writeFile(join(directory, "valid.ts"), `import { getInspectionConfig, type ConstructionInspectionModuleConfig, type ConstructionInspectionConfig } from ${JSON.stringify(registryPath)}; const moduleConfig: ConstructionInspectionModuleConfig | null = getInspectionConfig("wall", "geometry"); const constructionConfig: ConstructionInspectionConfig | null = getInspectionConfig("wall");`);
    await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ extends: profile, files: ["valid.ts"], include: [] }));
    const valid = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);
    await writeFile(join(directory, "invalid.ts"), 'const nullable: number = null; function implicit(value) { return value; } const values: number[] = []; const indexed: number = values[0]; const optional: { value?: number } = { value: undefined };');
    await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ extends: profile, files: ["invalid.ts"], include: [] }));
    const result = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", join(directory, "tsconfig.json")], { encoding: "utf8" });
    assert.equal(result.status, 2);
    for (const code of ["TS2322", "TS7006", "TS2375"]) assert.ok(result.stdout.includes(code), result.stdout);
    assert.equal((result.stdout.match(/TS2322/g) || []).length, 2, "both null and unchecked array reads must be rejected");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("construction and registry obey the same infrastructure import boundary", () => {
  for (const filename of ["src/client/app/construction.ts", "src/client/app/inspection-registry.ts"]) {
    const result = spawnSync(process.execPath, ["node_modules/eslint/bin/eslint.js", "--stdin", "--stdin-filename", filename, "--format", "json"], {
      input: 'import { db } from "../infrastructure/firebase/firestore.js";', encoding: "utf8"
    });
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stdout).flatMap(file => file.messages).some(message => message.ruleId === "no-restricted-imports"));
  }
});
