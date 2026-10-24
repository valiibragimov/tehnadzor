# Private as-built documents

[Русский](document-storage.ru.md)

PDF versions use Firestore metadata under `projects/{projectId}/documents/{documentId}/versions/{versionId}` and immutable Cloud Storage objects. Membership in `documentMembers/{uid}` grants document-only reader/editor access; the project owner manages membership. It does not grant access to inspections or project settings. A version may link to a construction, a saved inspection and a BIM element. Linking to a missing inspection in the selected project is rejected.

Configure the existing authenticated API with `FIREBASE_STORAGE_BUCKET` and Admin credentials for the intended project. The bucket must be private, with public access prevention. Set `window.__APP_CONFIG__.DOCUMENT_API_BASE` before application startup when the API is hosted separately; its origin must be allowed by the API's existing `ALLOWED_ORIGINS` configuration. Otherwise document requests use the application's origin. Deployment and bucket provisioning are separate operator actions; this change does not perform them.

Clients can stage metadata but cannot write bytes or mark a version ready. The API verifies identity, owner/editor access, size (20 MiB maximum), PDF signature/end marker, SHA-256 and the immutable target. A generation precondition prevents overwrites. It rechecks membership in the finalization transaction. Failed uploads remain visible as pending; an interrupted finalization can be retried. A fresh upload always gets a new version ID, retaining earlier versions.

Upload and download use the API rather than Firebase client Storage endpoints: those endpoints can mint persistent download tokens. No signed URLs or Firebase download URLs are created. Downloads recheck current membership and file integrity, return attachments with `private, no-store`, and are excluded from service-worker caching. Revocation blocks future requests; it cannot recall a file a participant already downloaded. Client Storage access is denied by `storage.rules`; API Admin access enforces the same membership policy explicitly.

PDF signature validation does not assess the engineering contents or approve a laboratory conclusion. Concrete acceptance still requires a separately confirmed assessment. The original engineering records, their IDs and historical statuses are not migrated or rewritten.

Verification: `npm run test:documents` starts loopback Firestore/Storage emulators for a `demo-` project. The public demo does not connect to a storage backend. Versions and incomplete attempts have no automatic deletion or retention job. Back up metadata and objects together. Rolling back application code does not require deleting any document or inspection data; retain deny-by-default Storage rules.
