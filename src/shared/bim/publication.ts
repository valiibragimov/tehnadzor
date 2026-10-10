export interface BimDocument { id: string; data: Record<string, unknown> }
export interface BimTransaction {
  get(path: string): Promise<Record<string, unknown> | null>;
  set(path: string, data: Record<string, unknown>): void;
  delete(path: string): void;
}
export interface BimPageOptions { filter?: { field: string; value: string }; after?: string; limit: number }
export interface BimStore {
  id(): string;
  timestamp(): unknown;
  get(path: string): Promise<Record<string, unknown> | null>;
  list(collection: string, filter?: { field: string; value: string }): Promise<BimDocument[]>;
  page(collection: string, options: BimPageOptions): Promise<BimDocument[]>;
  batch(documents: Array<{ path: string; data: Record<string, unknown> }>, guard?: (transaction: BimTransaction) => Promise<void>): Promise<void>;
  transaction<T>(action: (transaction: BimTransaction) => Promise<T>): Promise<T>;
}
export interface BimElementRecord { elementId: string; sourceModelId: string; [key: string]: unknown }
export interface PublicationResult { writtenCount: number; removedCount: number }
const epoch = (state: Record<string, unknown> | null): number => Number(state?.epoch || 0);
const revision = (state: Record<string, unknown> | null): number => Number(state?.revision || 0);
const conflict = (): Error => Object.assign(new Error("The BIM model changed during import. Reload and retry."), { status: 409 });
const checkId = (id: string): void => { if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error("Invalid BIM model identifier"); };
const advance = (tx: BimTransaction, state: Record<string, unknown> | null): void => tx.set("bimState/current", { ...state, schemaVersion: 1, revision: revision(state) + 1 });
const milliseconds = (value: unknown): number => typeof value === "number" ? value : value && typeof (value as { toMillis?: unknown }).toMillis === "function" ? (value as { toMillis(): number }).toMillis() : Infinity;
const leaseDuration = 5 * 60_000;

async function* collectionPages(store: BimStore, collection: string, filter?: BimPageOptions["filter"], size = 200): AsyncGenerator<BimDocument[]> {
  let after: string | undefined;
  for (;;) {
    const documents = await store.page(collection, { filter, after, limit: size });
    if (!documents.length) return;
    yield documents;
    after = documents[documents.length - 1].id;
    if (documents.length < size) return;
  }
}

/** Every staging chunk is fenced against cleanup and delayed writers. */
export async function publishBimModel(store: BimStore, sourceModelId: string, elements: BimElementRecord[]): Promise<PublicationResult> {
  checkId(sourceModelId);
  if (!elements.length) throw new Error("Cannot publish an empty BIM model");
  const ids = new Set<string>();
  for (const element of elements) {
    if (element.sourceModelId !== sourceModelId || !element.elementId || element.elementId.includes("/") || ids.has(element.elementId)) throw new Error("Invalid or duplicate BIM element identity");
    ids.add(element.elementId);
  }
  const modelPath = `bimModels/${sourceModelId}`;
  const generation = store.id();
  const generationPath = `bimGenerations/${generation}`;
  const baseline = await store.transaction(async tx => {
    const state = await tx.get("bimState/current"), model = await tx.get(modelPath);
    tx.set(generationPath, { sourceModelId, status: "staging", updatedAt: store.timestamp() });
    return { state, model };
  });
  for (let offset = 0; offset < elements.length; offset += 200) {
    await store.batch(elements.slice(offset, offset + 200).map(element => ({ path: `bimElements/${generation}_${element.elementId}`, data: { ...element, bimGeneration: generation } })), async tx => {
      const record = await tx.get(generationPath);
      if (record?.status !== "staging") throw conflict();
      tx.set(generationPath, { ...record, updatedAt: store.timestamp() });
    });
  }
  const legacyCount = !baseline.model && !baseline.state?.legacyHidden
    ? (await store.list("elements", { field: "sourceModelId", value: sourceModelId })).length : 0;
  await store.transaction(async tx => {
    const state = await tx.get("bimState/current"), model = await tx.get(modelPath), record = await tx.get(generationPath);
    if (record?.status !== "staging" || epoch(state) !== epoch(baseline.state) || revision(model) !== revision(baseline.model)) throw conflict();
    const previous = model?.generation ? await tx.get(`bimGenerations/${model.generation}`) : null;
    if (previous) tx.set(`bimGenerations/${model!.generation}`, { ...previous, retiredAt: store.timestamp() });
    const publication = { schemaVersion: 1, sourceModelId, generation, epoch: epoch(state), revision: revision(model) + 1, count: elements.length, deleted: false, publishedAt: Date.now() };
    tx.set(generationPath, { ...record, status: "ready", updatedAt: store.timestamp() });
    tx.set(`bimPublications/${generation}`, publication);
    tx.set(modelPath, publication);
    advance(tx, state);
  });
  return { writtenCount: elements.length, removedCount: baseline.model && epoch(baseline.model) === epoch(baseline.state) ? Number(baseline.model.count || 0) : legacyCount };
}

/** Pins one catalog version across publication/deletion. Discard partial pages if iteration fails. */
export async function* readPublishedBimPages(store: BimStore, pageSize = 200): AsyncGenerator<BimDocument[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error("Invalid BIM page size");
  const leasePath = `bimReaders/${store.id()}`;
  let manifests: BimDocument[] = [], state: Record<string, unknown> | null = null;
  let acquired = false;
  for (let attempt = 0; attempt < 5 && !acquired; attempt++) {
    state = await store.get("bimState/current");
    manifests = await store.list("bimModels");
    acquired = await store.transaction(async tx => {
      const current = await tx.get("bimState/current");
      if (revision(current) !== revision(state) || epoch(current) !== epoch(state)) return false;
      const active = manifests.filter(m => !m.data.deleted && epoch(m.data) === epoch(state));
      for (const manifest of active) {
        if (manifest.data.schemaVersion !== 1) throw new Error("Unsupported BIM publication schema version");
        if ((await tx.get(`bimGenerations/${manifest.data.generation}`))?.status === "deleting") return false;
      }
      tx.set(leasePath, { generations: active.map(m => m.data.generation), updatedAt: store.timestamp() });
      advance(tx, current);
      return true;
    });
  }
  if (!acquired) throw conflict();
  const renew = () => store.transaction(async tx => {
    const lease = await tx.get(leasePath);
    if (!lease) throw conflict();
    for (const generation of lease.generations as string[]) {
      const record = await tx.get(`bimGenerations/${generation}`);
      if (record?.status === "deleting" || record?.status === "purged") throw conflict();
    }
    tx.set(leasePath, { ...lease, updatedAt: store.timestamp() });
  });
  try {
    const hidden = new Set(manifests.map(m => m.id));
    if (!state?.legacyHidden) {
      for await (const page of collectionPages(store, "elements", undefined, pageSize)) {
        await renew();
        const visible = page.filter(d => !hidden.has(String(d.data.sourceModelId || "")));
        if (visible.length) yield visible;
      }
    }
    for (const manifest of manifests) {
      if (manifest.data.deleted || epoch(manifest.data) !== epoch(state)) continue;
      let count = 0;
      for await (const page of collectionPages(store, "bimElements", { field: "bimGeneration", value: String(manifest.data.generation) }, pageSize)) {
        await renew();
        count += page.length;
        yield page.map(document => {
          const { bimGeneration: _generation, ...data } = document.data;
          return { id: String(data.elementId), data };
        });
      }
      await renew();
      if (count !== manifest.data.count) throw new Error("BIM generation is incomplete. Reconnect and reload the project.");
    }
  } finally {
    await store.transaction(async tx => { tx.delete(leasePath); });
  }
}

export async function loadPublishedBimElements(store: BimStore): Promise<BimDocument[]> {
  const result: BimDocument[] = [];
  for await (const page of readPublishedBimPages(store)) result.push(...page);
  return result;
}

export async function hideBimModels(store: BimStore, sourceModelId?: string): Promise<number> {
  if (sourceModelId) checkId(sourceModelId);
  // Counts come from manifests: damaged geometry must never prevent deletion.
  const stateBefore = await store.get("bimState/current");
  const manifests = await store.list("bimModels");
  let count = manifests.filter(m => !m.data.deleted && epoch(m.data) === epoch(stateBefore) && (!sourceModelId || m.id === sourceModelId)).reduce((sum, m) => sum + Number(m.data.count || 0), 0);
  if (!stateBefore?.legacyHidden) for await (const page of collectionPages(store, "elements")) count += page.filter(d => !manifests.some(m => m.id === d.data.sourceModelId) && (!sourceModelId || d.data.sourceModelId === sourceModelId)).length;
  await store.transaction(async tx => {
    const state = await tx.get("bimState/current");
    if (revision(state) !== revision(stateBefore) || epoch(state) !== epoch(stateBefore)) throw conflict();
    if (!sourceModelId) tx.set("bimState/current", { ...state, schemaVersion: 1, revision: revision(state) + 1, epoch: epoch(state) + 1, legacyHidden: true, clearedAt: store.timestamp() });
    else {
      const path = `bimModels/${sourceModelId}`, model = await tx.get(path);
      const previous = model?.generation ? await tx.get(`bimGenerations/${model.generation}`) : null;
      if (previous) tx.set(`bimGenerations/${model!.generation}`, { ...previous, retiredAt: store.timestamp() });
      tx.set(path, { schemaVersion: 1, sourceModelId, epoch: epoch(state), revision: revision(model) + 1, deleted: true, count: 0 });
      advance(tx, state);
    }
  });
  return count;
}

/** Run from trusted maintenance infrastructure. Unknown pre-migration generations are retained. */
export async function collectBimGenerations(store: BimStore, options: { now?: number; retentionMs?: number; stagingMs?: number } = {}): Promise<{ generations: number; elements: number }> {
  const now = options.now ?? Date.now(), retention = options.retentionMs ?? 86_400_000, staging = options.stagingMs ?? 3_600_000;
  if (![now, retention, staging].every(Number.isFinite) || retention < leaseDuration || staging < leaseDuration) throw new Error("Invalid BIM retention policy");
  let generations = 0, elements = 0;
  for await (const candidates of collectionPages(store, "bimGenerations")) for (const candidate of candidates) {
    let claimed = false;
    for (let attempt = 0; attempt < 5 && !claimed; attempt++) {
      const state = await store.get("bimState/current"), readers = await store.list("bimReaders");
      const protectedGeneration = readers.some(r => milliseconds(r.data.updatedAt) + leaseDuration > now && (r.data.generations as string[]).includes(candidate.id));
      if (protectedGeneration) break;
      const outcome = await store.transaction(async tx => {
        const current = await tx.get("bimState/current"), record = await tx.get(`bimGenerations/${candidate.id}`);
        if (revision(current) !== revision(state)) return "retry";
        if (!record || record.status === "purged") return "skip";
        // Acquisition changes the root revision; renewal changes its immutable lease.
        // Re-read relevant leases in this transaction to avoid a root write per page.
        for (const reader of readers.filter(r => (r.data.generations as string[]).includes(candidate.id))) {
          const lease = await tx.get(`bimReaders/${reader.id}`);
          if (lease && milliseconds(lease.updatedAt) + leaseDuration > now) return "skip";
        }
        const model = await tx.get(`bimModels/${record.sourceModelId}`);
        if (model?.generation === candidate.id && !model.deleted && epoch(model) === epoch(current)) return "skip";
        const retiredAt = record.retiredAt ?? (model && epoch(model) !== epoch(current) ? current?.clearedAt : undefined) ?? record.updatedAt;
        if (record.status !== "deleting" && milliseconds(record.status === "staging" ? record.updatedAt : retiredAt) + (record.status === "staging" ? staging : retention) > now) return "skip";
        tx.set(`bimGenerations/${candidate.id}`, { ...record, status: "deleting" });
        advance(tx, current);
        return "claimed";
      });
      if (outcome === "skip") break;
      claimed = outcome === "claimed";
    }
    if (!claimed) continue;
    for await (const page of collectionPages(store, "bimElements", { field: "bimGeneration", value: candidate.id })) {
      const deleted = await store.transaction(async tx => {
        const record = await tx.get(`bimGenerations/${candidate.id}`);
        if (record?.status === "purged") return false;
        if (record?.status !== "deleting") throw conflict();
        for (const document of page) tx.delete(`bimElements/${document.id}`);
        return true;
      });
      if (deleted) elements += page.length;
    }
    await store.transaction(async tx => {
      const record = await tx.get(`bimGenerations/${candidate.id}`);
      if (record?.status === "deleting") tx.set(`bimGenerations/${candidate.id}`, { ...record, status: "purged", updatedAt: store.timestamp() });
    });
    generations++;
  }
  for await (const page of collectionPages(store, "bimReaders")) for (const reader of page) await store.transaction(async tx => {
    const current = await tx.get(`bimReaders/${reader.id}`);
    if (current && milliseconds(current.updatedAt) + leaseDuration <= now) tx.delete(`bimReaders/${reader.id}`);
  });
  return { generations, elements };
}
