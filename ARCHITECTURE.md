# Architecture

Tehnadzor is a TypeScript modular monolith backed by Firebase Auth and Firestore. It preserves inspection records and stable BIM element IDs while replacing implementation details behind explicit boundaries.

## Runtime

The client composes feature services and UI. Existing inspection calculation modules remain pure. The common HTTP transport uses openapi-fetch and generated OpenAPI types. Request validators live in `server/src/http-contract.ts`; `npm run api:generate` produces the specification, types and route identifiers. CI rejects generated-contract drift.

IFC import uses one WebIFC adapter in `src/shared/bim/ifc-model.ts`. A browser Worker and a bounded Piscina Node pool consume it. WebIFC owns STEP decoding, schemas, entity values and references. The adapter maps typed entities into vendor-independent inspection data: project/property length units, local placement transforms, property sets, floors and declared dimensions. Unsupported dimensions remain null. Invalid coordinate tuples are rejected instead of heuristically rewriting decimal separators. The legacy cottage fixture contains malformed decimal-comma tuples and is retained for diagnosis; the viewer harness uses a valid synthetic fixture by default.

Interactive server imports use an in-memory bounded queue, not a durable distributed broker. CPU parsing runs off the event loop; Firestore writes remain asynchronous I/O. Limits are configurable (`IFC_WORKER_THREADS`, `IFC_WORKER_QUEUE`, `IFC_WORKER_TIMEOUT_MS`, `IFC_WORKER_MAX_BYTES`, `IFC_WORKER_HEAP_MB`); shutdown drains workers. The V8 heap limit does not cap native WASM memory, so input/entity bounds are also enforced. No GPU is needed for metadata import. Three.js/IFC-Lite remain the isolated rendering implementation, with on-demand rendering. The unused alternative renderer and unused That Open component dependencies have been removed. Stable bundle filenames remain public asset paths.

`server/src/application/import-ifc.ts` depends only on typed parse/save ports. Both Firebase adapters use `src/shared/bim/publication.ts`: imports stage immutable generations in bounded batches, then publish a manifest transactionally. Concurrent publishers compare revisions; deletion increments a model revision or project epoch so a delayed importer cannot resurrect deleted content. Readers verify manifest counts and preserve logical element IDs. Legacy `elements` remain readable until their model is replaced or explicitly hidden; no backfill runs automatically. Publication schema version 1 is explicit; unknown manifest versions fail closed. Each successful commit also records an immutable `bimPublications` receipt with its generation and expected count. Superseded and failed generations are retained for safe readers and recovery. Rollback requires an operator to select a successful receipt, verify its complete generation and republish it; rolling back to the legacy reader requires projecting the selected snapshot into `elements` first. No automatic destructive rollback or live migration is performed. A retention/garbage-collection job is still required before sustained high-volume operation.

Workspace composition passes a typed context to journal, overview, summary, geometry and control-plan modules. Features own their state; they no longer expose it through `window` or monkey-patch project selection. Firebase SDK facades are bundled locally with shared chunks so Auth and Firestore use one application registry. The browser test exercises this registry and IndexedDB initialization without external requests.

## Presentation

The new design system uses semantic color/surface tokens and a higher-priority CSS cascade layer. Desktop navigation is a persistent sidebar; mobile retains compact bottom navigation. Buttons use native keyboard semantics. Blur, glow and cursor-motion handlers were removed. The large legacy component stylesheet remains in a lower-priority layer until individual feature layouts are migrated and checked.

Workspace navigation, overview and inspection-register controls use i18next with RU/EN dictionaries, persisted language choice and live updates. Existing engineering forms, report wording, persisted construction values and normative notation remain Russian. Complete form localization is still migration work; changing a display language must never rewrite stored domain values.

## Operational limits and remaining migration

- Firestore Emulator tests cover staging failure, concurrent publication, deletion races and owner isolation using synthetic fixtures. No live data was migrated. Representative production-scale fixtures are still needed.
- Remaining feature-specific Firebase calls and legacy CSS should move by vertical use case, with behavior tests. Full model reads still materialize records; pagination and retention need workload measurements.
- Large/tessellated IFC design dimensions, IFC Grid/LinearPlacement and complex property structures need additional fixtures and adapter support before claiming complete format coverage.
- A durable multi-instance job queue should follow measured background-job requirements and transactional model publication; the current request-bound pool is intentionally process-local.
- Browser SDK persistence upgrades from older deployed clients require staging verification with representative pre-existing browser caches.

## References

- [WebIFC](https://github.com/ThatOpen/engine_web-ifc) — MPL-2.0; imported through a small adapter.
- [Piscina](https://github.com/piscinajs/piscina) — MIT; bounded worker pool.
- [OpenAPI TypeScript](https://openapi-ts.dev/) — MIT; generated types and typed transport.
- [i18next](https://www.i18next.com/) — MIT; presentation localization.
- [shadcn sidebar patterns](https://ui.shadcn.com/docs/components/sidebar) — UX reference; no React migration or copied component implementation.
