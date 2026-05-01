import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = resolve(__filename, "..", "..");

const targets = [
  resolve(projectRoot, "node_modules", "@thatopen", "fragments", "dist", "index.mjs"),
  resolve(projectRoot, "node_modules", "@thatopen", "fragments", "dist", "index.cjs")
];

const patches = [
  {
    description: "guard missing attribute upload hook",
    find: 'cleanAttributeMemory(t,e){t.attributes[e].onUpload(this.deleteAttribute(t))}',
    replace: 'cleanAttributeMemory(t,e){const s=t&&t.attributes?t.attributes[e]:null;s&&"function"==typeof s.onUpload&&s.onUpload(this.deleteAttribute(t))}'
  },
  {
    description: "skip fragment meshes with empty positions",
    find: 'setPositions(t,e){if(!t)throw new Error("Fragments: no positions provided to create the mesh.");e.setAttribute("position",new ft.BufferAttribute(t,3)),this.cleanAttributeMemory(e,"position")}',
    replace: 'setPositions(t,e){if(!t||0===t.length){e.setAttribute("position",new ft.BufferAttribute(new Float32Array(0),3));return}e.setAttribute("position",new ft.BufferAttribute(t,3)),this.cleanAttributeMemory(e,"position")}'
  },
  {
    description: "skip fragment meshes with empty indices",
    find: 'setIndex(t,e){if(!e)throw new Error("Fragments: no indices provided to create the mesh.");t.setIndex(new ft.BufferAttribute(e,1)),t.index.onUpload(this.deleteAttribute(t))}',
    replace: 'setIndex(t,e){if(!e||0===e.length){t.setIndex([]);return}t.setIndex(new ft.BufferAttribute(e,1)),t.index&&t.index.onUpload(this.deleteAttribute(t))}'
  },
  {
    description: "skip fragment meshes with empty positions (cjs)",
    find: 'setPositions(t,e){if(!t)throw new Error("Fragments: no positions provided to create the mesh.");e.setAttribute("position",new Et.BufferAttribute(t,3)),this.cleanAttributeMemory(e,"position")}',
    replace: 'setPositions(t,e){if(!t||0===t.length){e.setAttribute("position",new Et.BufferAttribute(new Float32Array(0),3));return}e.setAttribute("position",new Et.BufferAttribute(t,3)),this.cleanAttributeMemory(e,"position")}'
  },
  {
    description: "skip fragment meshes with empty indices (cjs)",
    find: 'setIndex(t,e){if(!e)throw new Error("Fragments: no indices provided to create the mesh.");t.setIndex(new Et.BufferAttribute(e,1)),t.index.onUpload(this.deleteAttribute(t))}',
    replace: 'setIndex(t,e){if(!e||0===e.length){t.setIndex([]);return}t.setIndex(new Et.BufferAttribute(e,1)),t.index&&t.index.onUpload(this.deleteAttribute(t))}'
  }
];

for (const target of targets) {
  let contents;
  try {
    contents = await readFile(target, "utf8");
  } catch {
    continue;
  }

  let nextContents = contents;
  for (const patch of patches) {
    if (nextContents.includes(patch.replace)) {
      continue;
    }
    nextContents = nextContents.replace(patch.find, patch.replace);
  }

  if (nextContents !== contents) {
    await writeFile(target, nextContents, "utf8");
    console.log(`[patch-thatopen-fragments] patched ${target}`);
  }
}
