# Contributing

Describe the problem and the affected workflow in an issue or pull request. Keep changes focused and explain how you checked them. Documentation fixes are welcome; application changes need verification of the relevant inspection flow.

Read [Development](docs/development.md) for setup and test commands, and [Architecture](ARCHITECTURE.md) for module boundaries. [AGENTS.md](AGENTS.md) contains the repository's engineering rules.

## Before submitting

- Preserve engineering units, tolerances, normative references and saved record identities.
- Keep evaluation logic independent of UI and storage. Use existing feature APIs and shared contracts.
- Add tests for changed behaviour, especially calculations, IFC mapping, report output, concurrency and data formats.
- Run the checks in [README](README.md#development-and-tests). For documentation-only changes, verify commands and links; application tests are needed if behaviour changes.
- Explain any schema change, migration and recovery path. Do not run migrations against live data during development.

When changing an HTTP contract, run `npm run api:generate`. When changing shared BIM publication declarations, run `npm run shared:generate`. Commit the generated contract files with their source changes.

Do not edit build outputs by hand: `dist/`, `dist-demo/`, `dist-hosting/`, `server/dist/`, `functions/dist/`, root `index.html` and root `sw.js`.

Use synthetic fixtures. Never include credentials, local environment files, private models, personal details or confidential construction documents in commits, logs or screenshots. See [Security](SECURITY.md) for reporting sensitive issues.

## Licensing

Tehnadzor is proprietary software under [LICENSE](LICENSE). Contributions may be incorporated into the proprietary project. Contributing does not grant a separate license to use the application; usage rights require the copyright holder's written permission.
