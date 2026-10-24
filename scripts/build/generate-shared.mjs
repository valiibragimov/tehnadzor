import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
for (const [sourcePath, path] of [["src/shared/bim/publication.ts", "src/client/infrastructure/bim-publication.d.ts"], ["src/shared/documents.ts", "src/client/infrastructure/document-validation.d.ts"]]) {
const source = await readFile(sourcePath, "utf8");
const output = ts.transpileDeclaration(source, { fileName: sourcePath, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
if (output.diagnostics?.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(output.diagnostics, { getCurrentDirectory: () => process.cwd(), getCanonicalFileName: name => name, getNewLine: () => "\n" }));
const content = `// Generated from ${sourcePath}. Do not edit.\n` + output.outputText;

if (process.argv.includes("--check")) { if (await readFile(path, "utf8").catch(() => "") !== content) throw new Error("Run npm run shared:generate"); }
else await writeFile(path, content);

}
