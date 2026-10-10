# Architecture

Tehnadzor is a TypeScript modular monolith backed by Firebase Auth and Firestore. It preserves inspection records and stable BIM element IDs while replacing implementation details behind explicit boundaries.

## Runtime

The client composes feature services and UI. Existing inspection calculation modules remain pure. The common HTTP transport uses openapi-fetch and generated OpenAPI types. Request validators live in `server/src/http-contract.ts`; `npm run api:generate` produces the specification, types and route identifiers. CI rejects generated-contract drift.

IFC import uses one WebIFC adapter in `src/shared/bim/ifc-model.ts`. A browser Worker and a bounded Piscina Node pool consume it. WebIFC owns STEP decoding, schemas, entity values and references. The adapter maps typed entities into vendor-independent inspection data: project/property length units, local placement transforms, property sets, floors and declared dimensions. Unsupported dimensions remain null. Invalid coordinate tuples are rejected instead of heuristically rewriting decimal separators. The legacy cottage fixture contains malformed decimal-comma tuples and is retained for diagnosis; the viewer harness uses a valid synthetic fixture by default.

Interactive server imports use an in-memory bounded queue, not a durable distributed broker. CPU parsing runs off the event loop; Firestore writes remain asynchronous I/O. Limits are configurable; shutdown drains workers. No GPU is needed for metadata import. Three.js/IFC-Lite remain the isolated rendering implementation, with on-demand rendering. The unused alternative renderer and unused That Open component dependencies have been removed. Stable bundle filenames remain public asset paths.

`server/src/application/import-ifc.ts` depends only on typed parse/save ports. Firebase initialization, repository operations and report rendering are separate modules. Imports validate before persistence, upsert first, then remove obsolete IDs. Existing Firestore fields and IDs are unchanged. A failed parse never writes; failed multi-batch writes do not erase the previous model first. Multi-batch updates are not atomic: interrupted imports must be retried. Cross-instance locking and generation-based publication require a separately tested storage migration.

## Presentation

The new design system uses semantic color/surface tokens and a higher-priority CSS cascade layer. Desktop navigation is a persistent sidebar; mobile retains compact bottom navigation. Buttons use native keyboard semantics. Blur, glow and cursor-motion handlers were removed. The large legacy component stylesheet remains in a lower-priority layer until individual feature layouts are migrated and checked.

Workspace navigation and overview use i18next with RU/EN dictionaries, persisted language choice and live updates. Existing engineering forms, report wording, persisted construction values and normative notation remain Russian. Complete form localization is still migration work; changing a display language must never rewrite stored domain values.

## Operational limits and remaining migration

- Firebase-authenticated persistence still needs emulator integration tests and representative project fixtures; no live data was migrated.
- Some legacy client features still use global runtime context and direct Firebase calls. Move them by vertical use case, with behavior tests.
- Large/tessellated IFC design dimensions, IFC Grid/LinearPlacement and complex property structures need additional fixtures and adapter support before claiming complete format coverage.
- A durable multi-instance job queue should follow measured background-job requirements and transactional model publication; the current request-bound pool is intentionally process-local.
- The browser Firebase SDK still loads from the existing CDN entrypoints. A bundling migration must preserve a single SDK runtime and test IndexedDB/auth upgrades.

## References

- [WebIFC](https://github.com/ThatOpen/engine_web-ifc) — MPL-2.0; imported through a small adapter.
- [Piscina](https://github.com/piscinajs/piscina) — MIT; bounded worker pool.
- [OpenAPI TypeScript](https://openapi-ts.dev/) — MIT; generated types and typed transport.
- [i18next](https://www.i18next.com/) — MIT; presentation localization.
- [shadcn sidebar patterns](https://ui.shadcn.com/docs/components/sidebar) — UX reference; no React migration or copied component implementation.
