# Tehnadzor

Tehnadzor is a web application for construction inspection. It helps field engineers and quality control teams record measurements, compare them with design values and tolerances, and follow up on defects within a project.

The work centres on four kinds of checks: survey coordinates and elevations, reinforcement, structural geometry, and concrete strength. IFC models provide element context and some design values alongside the measurements taken on site.

The project is under active development. Its engineering checks use Russian SP and GOST references; the interface supports Russian and English, with some results and report text still in Russian.

## What you can do

- Create projects and organise checks by structure, floor and grid axes.
- Record design and measured values, evaluate deviations, and revisit saved checks.
- Track issues in the inspection register and record repeat inspections without replacing the original evidence.
- Use a control plan to see which checks are required and where records are missing.
- Import IFC elements, select them in inspection forms, and inspect a model in the 3D viewer.
- Review project summaries and analytics, export register data as CSV or JSON, and prepare reports, including PDF output.

IFC support is selective. Missing or unsupported design dimensions stay empty rather than being inferred from the rendered mesh. See [BIM and IFC](docs/bim.md) for supported data, coordinate handling and model-size limits.

## How it is built

The browser application uses TypeScript, HTML and CSS, without a UI framework. Firebase Authentication handles sign-in; Firestore stores projects and inspection records.

An Express API provides server-side IFC import and report generation. IFC parsing uses a shared WebIFC adapter, running in a browser Worker or a bounded Piscina worker pool on the server. The 3D viewer uses Three.js and IFC-Lite. Report text is assembled from inspection data; it does not require an external AI model.

OpenAPI defines the HTTP contract. Generated types and route identifiers are used by the client through `openapi-fetch`. Presentation translations use i18next. A separate Firebase Function serves the profile news feed.

See [Architecture](ARCHITECTURE.md) for module boundaries and data consistency.

## Run locally

Use Node.js 22.12 or later in the Node 22 release line, npm, and Python 3 for the static server below. The pinned Node version is in [.nvmrc](.nvmrc).

```sh
git clone https://github.com/valiibragimov/tehnadzor.git
cd tehnadzor
npm ci
npm ci --prefix server
npm ci --prefix functions
```

Copy [.env.example](.env.example) to `.env` and fill all six `FIREBASE_WEB_*` values from a **development** Firebase project. Configure Authentication and Firestore for that project; a client build alone does not configure those services.

```sh
npm run build:client
python -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/>. Rebuild the client after source changes.

To explore the workspace without Firebase, follow the [isolated demo setup](docs/development.md#isolated-demo). It uses local sample data and supports IFC metadata import, but replaces charts and disables PDF export and the model viewer.

The [development guide](docs/development.md) covers Firebase setup, the optional API, build outputs and test prerequisites.

## Development and tests

```sh
npm run api:check
npm run shared:check
npm run typecheck
npm run lint
npm run build
npm test
npm run test:integration
npm run audit:all
```

`npm test` builds the client and demo, then runs smoke tests, core tests and Playwright browser scenarios. Windows browser tests use installed Google Chrome; Linux requires `npx playwright install --with-deps chromium`. Firestore integration tests require Java 21+ and use an isolated local emulator with synthetic data.

The [CI workflow](.github/workflows/ci.yml) runs these checks on pull requests to `main`. For changes to HTTP or shared BIM contracts, see [Contributing](CONTRIBUTING.md).

## Current limits

- Large models are read from Firestore in pages, but their metadata still occupies memory proportional to the number of elements. Geometry loading is not streamed.
- IFC exporter coverage is incomplete, especially for advanced placements and georeferencing. Imported coordinates and dimensions need review against the source design.
- Server imports run in a process-local queue. They are request-bound jobs, not a durable distributed job system.
- English translation is incomplete. Switching language preserves stored engineering values and normative notation.

## Documentation

- [Development](docs/development.md) — local setup, builds and verification.
- [Architecture](ARCHITECTURE.md) — runtime responsibilities and source layout.
- [BIM and IFC](docs/bim.md) — import, engineering data and safe model maintenance.
- [Contributing](CONTRIBUTING.md) — change scope and review expectations.
- [Security](SECURITY.md) — reporting vulnerabilities and handling sensitive data.

## License

Tehnadzor is proprietary software. Public source access does not grant permission to use, modify or distribute it. See [LICENSE](LICENSE) for the terms.
