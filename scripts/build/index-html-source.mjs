import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const indexPartialPaths = [
  "head.html",
  "header-shell.html",
  "sections/overview.html",
  "sections/geo.html",
  "sections/reinforcement.html",
  "sections/geometry.html",
  "sections/strength.html",
  "sections/control-plan.html",
  "sections/summary.html",
  "sections/journal.html",
  "sections/documents.html",
  "sections/knowledge.html",
  "post-main.html",
  "tail.html"
];

export async function readIndexHtmlSource(projectRoot) {
  const partialsRoot = resolve(projectRoot, "src", "client", "index-partials");
  const chunks = await Promise.all(
    indexPartialPaths.map((relativePath) => readFile(resolve(partialsRoot, relativePath), "utf8"))
  );

  return `${chunks.join("\n").trimEnd()}\n`;
}
