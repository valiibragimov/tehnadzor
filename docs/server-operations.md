[Русский](server-operations.ru.md) | [English](server-operations.md)

# Server operation lifetime

Heavy operation lifetimes are process-local. Rate history retains at most 10,000 keys, removes expired keys, and rejects new keys with 503 at capacity without dropping active rate limits. A disconnected response cancels queued/running IFC parsing; a normally completed request body does not. Once publication, deletion or a document upload starts, it finishes while holding its operation lock. SIGTERM/SIGINT stop admission, cancel preparation and await started persistence before closing workers and connections. Worker timeouts include queue wait. Shutdown has no hard deadline that would interrupt persistence; configure any external supervisor grace period accordingly. Forced process termination is outside this graceful-drain guarantee. No schema migration or distributed broker is introduced.
