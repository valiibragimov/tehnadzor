import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile("src/shared/bim/publication.ts", "utf8");
const output = ts.transpileDeclaration(source, { fileName: "publication.ts", compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
if (output.diagnostics?.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(output.diagnostics, { getCurrentDirectory: () => process.cwd(), getCanonicalFileName: name => name, getNewLine: () => "\n" }));
const content = "// Generated from src/shared/bim/publication.ts. Do not edit.\n" + output.outputText;
const path = "src/client/infrastructure/bim-publication.d.ts";
if (process.argv.includes("--check")) { if (await readFile(path, "utf8").catch(() => "") !== content) throw new Error("Run npm run shared:generate"); }
else await writeFile(path, content);
