# Contributing

[English](CONTRIBUTING.md) | [Русский](CONTRIBUTING.ru.md)

Thanks for your interest in SCOPE.

SCOPE is related to construction quality control, so changes should protect engineering accuracy: checks, tolerances, regulatory references, report logic, and BIM/IFC workflows must not be broken casually.

## Proposing Changes

- Open an issue or describe the change clearly in a pull request.
- Keep pull requests focused.
- Separate documentation, refactoring, and behavior changes when possible.
- Explain what problem the change solves and how it was checked.

## Local Development

```bash
npm install
cd server && npm install
cd ../functions && npm install
cd ..
```

Create local Firebase web config:

```bash
cp .env.example .env
```

Fill `FIREBASE_WEB_*` values in `.env` before building the client.

Run the client:

```bash
npm run build:client
python -m http.server 8000
```

## Checks

For code changes, run the relevant checks:

```bash
npm run lint
npm run typecheck
npm test
```

Add or update tests when behavior changes, especially around inspection calculations, IFC import, report output, server contracts, or data formats.

## Code Quality

- Follow the existing project style and structure.
- Do not edit generated output by hand: `dist/**`, `server/dist/**`, `functions/dist/**`, or root `sw.js`.
- Do not add parallel `.js` copies for active `.ts` source files.
- Keep domain logic readable; future contributors should be able to review engineering assumptions.

## Data Safety

Do not commit:

- `.env` files or local environment configs;
- Firebase service account files;
- private keys, tokens, cookies, OAuth secrets;
- real IFC/BIM models from closed projects;
- screenshots or samples with personal data, object addresses, contracts, cost estimates, or closed project documentation.

Use `.example` files with empty or clearly fake values when configuration examples are needed.

## Documentation PRs

Documentation-only pull requests should not change application behavior. If the documentation depends on a code change, mention that explicitly or split the work into separate PRs.

## Contribution License

By contributing, you agree that your contribution may be distributed under the MIT License used by this repository.
