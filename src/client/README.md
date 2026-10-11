# Client source

[app.ts](app.ts) composes the workspace. Keep new feature behaviour in its owning feature rather than expanding the entrypoint.

| Directory | Purpose |
| --- | --- |
| `features/` | Projects, control plan, journal API and inspection features |
| `app/modules/` | Existing screen orchestration and older feature implementations |
| `app/services/` | Existing application and integration services |
| `app/repositories/` | Firestore persistence adapters |
| `app/pages/` and `app/profile/` | Static page entrypoints and profile runtime |
| `app/ui/` and `app/pdf/` | Shared DOM bindings and PDF support |
| `app/vendor-src/` and `app/vendor/` | Vendor bundle sources and runtime declarations |
| `infrastructure/` | Typed HTTP transport, Firebase facades and shared publication adapter |
| `index-partials/` | Sources for generated root `index.html` |
| `shared/` and `types/` | Small shared client modules and declarations |
| `demo/` | Isolated sample-data runtime and replacement adapters |

A feature exposes a small public API through `index.ts`. Cross-feature calls use that API or dependencies supplied at workspace composition. UI calls services; repositories own persistence. Do not add global state bridges or turn shared modules into a catch-all.

Older files in `app/modules/` and `app/services/` are transitional. Follow existing feature boundaries for new work; move older logic only with tests for its actual consumers.

See [Architecture](../../ARCHITECTURE.md) for runtime boundaries and [Development](../../docs/development.md) for builds and browser tests.
