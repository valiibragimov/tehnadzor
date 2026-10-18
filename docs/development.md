[Русский](development.ru.md) | [English](development.md)

# Development

All npm commands below run from the repository root unless stated otherwise. Use Node 22.12+ in the Node 22 release line (`.nvmrc`), and install each package from its lockfile:

```sh
npm ci
npm ci --prefix server
npm ci --prefix functions
```

Python 3 is used only to serve static files in these examples. Another local static server is fine.

## Isolated demo

The demo replaces Firebase access with local sample data. It makes no requests to a live Firebase project or report API. Data is stored in the browser's local storage.

The client build still requires web configuration before the demo can copy its worker assets. For a demo-only environment, create a root `.env` with these deliberately fake values:

```dotenv
FIREBASE_WEB_API_KEY=demo-api-key
FIREBASE_WEB_AUTH_DOMAIN=demo.firebaseapp.com
FIREBASE_WEB_PROJECT_ID=demo-project
FIREBASE_WEB_STORAGE_BUCKET=demo.appspot.com
FIREBASE_WEB_MESSAGING_SENDER_ID=000000000000
FIREBASE_WEB_APP_ID=1:000000000000:web:demo
```

Do not overwrite an existing development configuration. These values cannot authenticate the regular application.

```sh
npm run build:client
npm run build:demo
python -m http.server 8000 --bind 127.0.0.1 --directory dist-demo
```

Open <http://127.0.0.1:8000/demo.html>. Only serve `dist-demo` for this mode. The demo supports the inspection workspace and real IFC metadata parsing; charts are placeholders, and PDF export and the model viewer are disabled. Viewer browser tests use a separate harness.

## Firebase application

Copy [.env.example](../.env.example) to `.env` and supply all six web configuration values from a dedicated development Firebase project. They are embedded in the client at build time. Keep Admin credentials out of this file.

Enable the sign-in providers used by your test accounts and authorise the local hostname in Firebase Authentication. Create Firestore and configure the repository's [rules](../firestore.rules) and [indexes](../firestore.indexes.json) in that development project. Do not use permissive rules as a setup shortcut.

```sh
npm run build:client
python -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000/> and sign in with a development account. This mode persists data to the configured Firebase project. Use synthetic projects and models.

There is no client development server or hot reload command. Run `npm run build:client` after changes. Root `index.html` is assembled from [HTML partials](../src/client/index-partials); edit those instead of the generated page.

## Optional Express API

The workspace can parse IFC and prepare report text in the browser. Run the API when developing the server paths.

Copy [server/.env.example](../server/.env.example) to `server/.env`. Configure Firebase Admin access for the same development project using either the documented service-account settings or Application Default Credentials. Keep `AUTH_REQUIRED=true`; the API verifies Firebase ID tokens and project access.

```sh
npm run dev --prefix server
```

This compiles the server, watches TypeScript, and restarts Node on changes. The default port is 5050. To run a compiled build without watch mode:

```sh
npm run build:server:ts
npm start --prefix server
```

The report API address is runtime configuration, not injected from root `.env`. The page must define `window.__APP_CONFIG__` with `AI_REPORT_API_BASE` before loading the application modules. Set it to the local API origin to use server reports, or leave it empty for browser report text. Include the static client's exact origin in the server's `ALLOWED_ORIGINS`.

The workspace currently imports IFC through its browser Worker and publishes directly through its Firestore adapter. The server IFC endpoint is a separate API path; the existing `BIM_IMPORT_API_BASE` configuration field does not switch the workspace to it.

Worker limits and request limits are documented in `server/.env.example`. The additional `IFC_WORKER_MAX_BYTES` setting caps worker input bytes (default 25 MiB); keep it consistent with the HTTP body limit. V8 heap limits do not bound WASM memory.

The Firebase Function in [functions/src/index.ts](../functions/src/index.ts) serves the profile news feed. It is separate from the inspection API and is not needed for the isolated demo.

The regular client loads Chart.js and jsPDF from external CDNs when needed. Charts and PDF output therefore need network access unless those assets are already available in the browser.

## Build outputs

`npm run build` cleans generated runtime files, compiles the client, server and Functions, builds the profile feed, and assembles and checks `dist-hosting`. It does not deploy anything.

| Output | Purpose |
| --- | --- |
| `dist/` | Browser modules, workers and viewer assets |
| `dist-demo/` | Isolated demo, built by `npm run build:demo` |
| `dist-hosting/` | Static hosting files |
| `server/dist/` | Compiled Express API and shared server code |
| `functions/dist/` | Compiled Firebase Function |

Root `index.html` and `sw.js` are generated too. Do not edit generated outputs by hand.

## Inspection write recovery

Inspection source records and their `inspections` projections commit atomically. Existing registry IDs are retained; new IDs include the source collection. Journal sessions also reserve their check number in the same transaction. Retry a create with the same source/session ID; it represents the same operation.

The additive project field `inspectionSync` has version `1`, a revision token and a `pending` flag. Analytics refresh clears the flag only if that revision still matches. A failed refresh leaves the marker in Firestore; reopening inspection modules retries it. Summary never falls back to a pending aggregate. No backfill or source format migration is required: projects without the field remain readable. Rolling back leaves existing source and registry formats readable and the marker ignored; reopen with the updated client to finish pending analytics repairs. Keep pending markers when rolling back.

## Verification

Run the commands listed in [README](../README.md#development-and-tests) before submitting application changes.

- `npm test` rebuilds the client and demo, then runs smoke, core and browser tests.
- When synthetic checks use `FIREBASE_CONFIG_MODE=test` beside a complete local `.env`, `npm test` restores that local login configuration and refreshes the service worker cache after success or failure. CI without a local `.env` keeps its synthetic runtime. Refresh `login.html` after the checks finish.
- `npm run test:core` builds the server and runs application, worker and IFC tests.
- `npm run test:ui` runs browser tests against existing build outputs; build the client and demo first.
- `npm run test:integration` builds the server and starts a loopback Firestore emulator using [firebase.emulator.json](../firebase.emulator.json). It requires Java 21+ and uses a `demo-` project, not live credentials.
- `npm run audit:all` checks all three dependency lockfiles.

On Linux, install Chromium and its system dependencies with `npx playwright install --with-deps chromium`. Windows tests launch installed Google Chrome.

[CI](../.github/workflows/ci.yml) supplies fake Firebase web values for builds. Tests use synthetic fixtures; they must not depend on live project data.
