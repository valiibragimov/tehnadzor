function makeHash(input) {
  let hash = 2166136261;
  const source = String(input || "");
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createSourceModelIdFromFile(file: File | Blob | null | undefined) {
  const baseName = String(file instanceof File ? file.name : "model")
    .replace(/\.ifc$/i, "")
    .toLowerCase();
  const slug = baseName
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = makeHash(baseName).slice(0, 6);
  return `${slug || "ifc-model"}-${suffix}`;
}
