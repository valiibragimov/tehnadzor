[Русский](SECURITY.ru.md) | [English](SECURITY.md)

# Security policy

Security fixes are accepted for the `main` branch. There is no separate supported release series.

## Reporting a vulnerability

Do not post exploit details or sensitive project data in public issues. Use a private maintainer contact if one is available. If you cannot find a private channel, open a minimal issue asking how to report the problem, without reproduction details that expose a live system.

A private report should describe the affected component, impact, expected behaviour and steps to reproduce with synthetic data. Include a safe example request or fixture where possible.

Never include credentials, cookies, tokens, service-account files, private keys, personal data, site addresses, contracts, cost estimates or confidential IFC models.

## Configuration and data

Local `.env` files and Firebase Admin credentials must stay outside version control. Use the committed `.env.example` files for configuration names only. Keep service accounts in protected local files or environment secret storage.

Firebase web configuration is embedded in the browser build. Its API key is a project identifier, not an Admin credential; it does not replace Firestore rules, Authentication restrictions or appropriate App Check configuration.

Before exposing an instance, verify that API authentication is enabled, project access is enforced, CORS origins are restricted, heavy operations are rate-limited, and logs omit tokens, file bodies and personal data. Review [Firestore rules](firestore.rules) and [data publication requirements](docs/bim.md#model-publication) together: Admin SDK access bypasses rules.

Use a separate development Firebase project or the isolated emulator for verification. Keep screenshots and sample models synthetic or anonymised.
