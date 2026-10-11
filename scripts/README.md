[Русский](README.ru.md) | [English](README.md)

# Repository scripts

Run scripts through the root [package.json](../package.json). Direct invocation is useful only when diagnosing a specific build step.

- `build/` assembles HTML, compiles and bundles runtime assets, generates contracts, builds the isolated demo and prepares hosting files.
- `checks/` runs smoke checks and validates generated hosting artifacts.
- `dev/` provides the Express development watcher.

`npm run build` produces local artifacts; it does not deploy. Generated files should be rebuilt from their sources. Setup, output directories and verification commands are in [Development](../docs/development.md).
