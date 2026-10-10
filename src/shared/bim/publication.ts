export interface BimDocument { id: string; data: Record<string, unknown> }
export interface BimTransaction {
  get(path: string): Promise<Record<string, unknown> | null>;
  set(path: string, data: Record<string, unknown>): void;
}
export interface BimStore {
  id(): string;
  get(path: string): Promise<Record<string, unknown> | null>;
  list(collection: string, filter?: { field: string; value: string }): Promise<BimDocument[]>;
  batch(documents: Array<{ path: string; data: Record<string, unknown> }>): Promise<void>;
  transaction<T>(action: (transaction: BimTransaction) => Promise<T>): Promise<T>;
}
export interface BimElementRecord { elementId: string; sourceModelId: string; [key: string]: unknown }
export interface PublicationResult { writtenCount: number; removedCount: number }
const epoch = (state: Record<string, unknown> | null): number => Number(state?.epoch || 0);
const revision = (model: Record<string, unknown> | null): number => Number(model?.revision || 0);
const conflict = (): Error => Object.assign(new Error("The BIM model changed during import. Reload and retry."), { status: 409 });
const checkId = (id: string): void => { if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error("Invalid BIM model identifier"); };

/** Immutable chunks become visible only through one transactional manifest write. */
export async function publishBimModel(store: BimStore, sourceModelId: string, elements: BimElementRecord[]): Promise<PublicationResult> {
  checkId(sourceModelId);
  if (!elements.length) throw new Error("Cannot publish an empty BIM model");
  const ids = new Set<string>();
  for (const element of elements) {
    if (element.sourceModelId !== sourceModelId || !element.elementId || element.elementId.includes("/") || ids.has(element.elementId)) throw new Error("Invalid or duplicate BIM element identity");
    ids.add(element.elementId);
  }
  const modelPath = `bimModels/${sourceModelId}`;
  const baseline = await store.transaction(async tx => ({ state: await tx.get("bimState/current"), model: await tx.get(modelPath) }));
  const generation = store.id();
  for (let offset = 0; offset < elements.length; offset += 200) {
    await store.batch(elements.slice(offset, offset + 200).map(element => ({ path: `bimElements/${generation}_${element.elementId}`, data: { ...element, bimGeneration: generation } })));
  }
  const legacyCount = !baseline.model && !baseline.state?.legacyHidden
    ? (await store.list("elements", { field: "sourceModelId", value: sourceModelId })).length : 0;
  await store.transaction(async tx => {
    const state = await tx.get("bimState/current");
    const model = await tx.get(modelPath);
    if (epoch(state) !== epoch(baseline.state) || revision(model) !== revision(baseline.model)) throw conflict();
    const publication = { schemaVersion: 1, sourceModelId, generation, epoch: epoch(state), revision: revision(model) + 1, count: elements.length, deleted: false, publishedAt: Date.now() };
    tx.set(`bimPublications/${generation}`, publication);
    tx.set(modelPath, publication);
  });
  return { writtenCount: elements.length, removedCount: baseline.model && epoch(baseline.model) === epoch(baseline.state) ? Number(baseline.model.count || 0) : legacyCount };
}

/** Legacy documents remain readable until their own model is published or explicitly deleted. */
export async function loadPublishedBimElements(store: BimStore): Promise<BimDocument[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const state = await store.get("bimState/current");
    const manifests = await store.list("bimModels");
    const hiddenSources = new Set(manifests.map(model => model.id));
    const result = state?.legacyHidden ? [] : (await store.list("elements")).filter(doc => !hiddenSources.has(String(doc.data.sourceModelId || "")));
    for (const manifest of manifests) {
      if (manifest.data.schemaVersion !== 1) throw new Error("Unsupported BIM publication schema version");
      if (manifest.data.deleted || epoch(manifest.data) !== epoch(state)) continue;
      const documents = await store.list("bimElements", { field: "bimGeneration", value: String(manifest.data.generation) });
      if (documents.length !== manifest.data.count) throw new Error("BIM generation is incomplete. Reconnect and reload the project.");
      result.push(...documents.map(document => {
        const { bimGeneration: _generation, ...data } = document.data;
        return { id: String(data.elementId), data };
      }));
    }
    if (epoch(await store.get("bimState/current")) === epoch(state)) return result;
  }
  throw conflict();
}

export async function hideBimModels(store: BimStore, sourceModelId?: string): Promise<number> {
  if (sourceModelId) checkId(sourceModelId);
  const elements = await loadPublishedBimElements(store);
  await store.transaction(async tx => {
    const state = await tx.get("bimState/current");
    if (!sourceModelId) {
      tx.set("bimState/current", { schemaVersion: 1, epoch: epoch(state) + 1, legacyHidden: true });
    } else {
      const path = `bimModels/${sourceModelId}`;
      const model = await tx.get(path);
      tx.set(path, { schemaVersion: 1, sourceModelId, epoch: epoch(state), revision: revision(model) + 1, deleted: true, count: 0 });
    }
  });
  return elements.filter(element => !sourceModelId || element.data.sourceModelId === sourceModelId).length;
}
