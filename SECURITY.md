# Security Policy

[English](SECURITY.md) | [Русский](SECURITY.ru.md)

## Supported Version

SCOPE is in early development. Security fixes are currently accepted for the main branch of the public repository.

## Reporting Vulnerabilities

Please do not publish sensitive details in public issues or discussions.

If you find a vulnerability, contact the maintainers privately if possible. If no private channel is available, open a minimal public issue without secrets, personal data, project files, or exploit details that could expose real systems.

Useful reports include:

- affected area: client, server, Firebase Functions, Firestore Rules, BIM/IFC import;
- steps to reproduce on test data;
- expected and actual behavior;
- possible impact;
- a safe example request or data fragment.

## Do Not Post Publicly

Never post:

- `.env` files, tokens, private keys, cookies, OAuth secrets;
- Firebase service account JSON files;
- real IFC/BIM models from closed projects;
- personal data;
- object addresses;
- contracts, cost estimates, or closed project documentation.

## Secrets And Configuration

Do not commit:

- `.env`, `.env.local`, `.env.production`, or similar files;
- `server/serviceAccount.local.json`;
- `serviceAccount*.json`, `firebase-adminsdk*.json`, `credentials*.json`;
- `*.pem`, `*.key`, `*.p12`, `*.pfx`;
- private SSH/OpenSSL keys.

Firebase web config is injected from local `.env` or `FIREBASE_WEB_*` environment variables during the client build. The Firebase web API key is not a Firebase Admin secret, but it identifies a project and should be used with proper Firestore Rules, Auth provider restrictions, allowed domains, and App Check where possible.

Firebase Admin credentials must stay in local files or deployment secret storage.

## Production Checklist

Before deploying a public instance, check that:

- server API authentication is enabled;
- Firestore Rules prevent access to other users' projects;
- CORS allows only expected origins;
- rate limits are enabled for heavy operations;
- service account credentials are stored only in secret storage;
- logs do not contain tokens, IFC file bodies, or personal data;
- screenshots, sample data, and demo IFC files are anonymized.
