# Architecture

Tehnadzor is a TypeScript modular monolith. The browser, Express API and Firebase Function are separate runtimes; shared engineering and publication code has no dependency on their UI or storage implementations.

## Runtime responsibilities

| Area | Responsibility |
| --- | --- |
| [Client](src/client) | Workspace composition, inspection forms, project navigation and presentation |
| [Inspection features](src/client/features/inspections) | Measurement evaluation, feature state and inspection use cases |
| [Client repositories](src/client/app/repositories) | Firestore access and persistence contracts |
| [Server application](server/src/application) | Import policy through injected parsing and storage ports |
| [Server infrastructure](server/src/infrastructure) and [repositories](server/src/repositories) | Firebase Admin and persistence adapters |
| [Server workers](server/src/workers) | CPU-bound IFC parsing, without Firestore writes |
| [Shared BIM](src/shared/bim) | Engineering data, WebIFC mapping and model publication policy |
| [Functions](functions/src) | Profile news feed HTTP function |

Firebase Authentication supplies user identity. Browser Firestore access is governed by [rules](firestore.rules). The API verifies tokens and project ownership before using Admin access, which bypasses those rules.

The browser composes features through an explicit workspace context. Features own their mutable state and expose public APIs. Engineering evaluation should remain independent of DOM operations and Firebase. Some older modules still combine these responsibilities; they are not the pattern for new work.

## HTTP contract

Request validators live in [server/src/http-contract.ts](server/src/http-contract.ts). The generator composes [api/openapi.json](api/openapi.json), shared TypeScript declarations and route identifiers. The client uses `openapi-fetch` with these generated contracts.

After a contract change:

```sh
npm run api:generate
npm run api:check
```

Do not hand-edit generated API files. Client HTTP calls use authentication and deadlines. Report rendering lives in [server/src/presentation](server/src/presentation), separately from HTTP handlers and persistence; reports are assembled from structured inspection results.

## IFC processing and persistence

A single [WebIFC adapter](src/shared/bim/ifc-model.ts) maps IFC entities to shared engineering data. Browser Workers and a bounded Piscina Node pool run that adapter. Network and Firestore work stay outside parsing workers.

The renderer is separate: Three.js and IFC-Lite produce the interactive scene. Rendered geometry is not an authoritative source of design dimensions. The viewer renders on demand and releases parser and WebGL resources when closed.

Both storage adapters use [publication.ts](src/shared/bim/publication.ts). Imports stage immutable generations and publish a manifest transactionally. Cursor pages and renewable reader leases keep a catalog snapshot consistent during concurrent imports and cleanup. Legacy records remain readable until replaced or explicitly hidden; there is no automatic backfill.

[BIM and IFC](docs/bim.md) documents the data model, concurrency rules, cleanup and coordinate limitations.

## Presentation

The UI uses native HTML controls with shared TypeScript bindings. Desktop navigation uses a sidebar; mobile uses bottom navigation. Inspection panels use native dialogs and help uses the Popover API.

[liquid-glass.css](liquid-glass.css) contains semantic tokens and shared components in the `design` cascade layer. The filename is a retained public asset path. [style.css](style.css) contains older layouts in the lower-priority `legacy` layer. Extend existing components rather than adding another override stylesheet.

[i18next dictionaries](src/client/shared/i18n) hold presentation translations. Language changes must not rewrite saved construction values, identifiers, axes or normative notation. Some result narratives and report text remain Russian.

## Source and generated files

[Client layout](src/client/README.md) explains feature and transitional directories. [Build scripts](scripts/README.md) cover generated artifacts. [Development](docs/development.md) lists commands and runtime prerequisites.

Shared publication declarations are generated with `npm run shared:generate`; `npm run shared:check` rejects drift. API and shared checks run as part of the client build.

## Known boundaries

The server queue is process-local and request-bound. There is no durable job broker or cross-instance scheduling. Firestore reads are paged, but the client retains a complete metadata catalog; geometry is not streamed. Representative large models and exporter fixtures are still needed for memory and format coverage.

Older feature-specific Firebase calls and CSS remain. Browser persistence upgrades also need staging verification against caches from older deployed clients. Changes in these areas should preserve saved records and be checked through the affected user flow.

Engineering and contribution rules are in [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
