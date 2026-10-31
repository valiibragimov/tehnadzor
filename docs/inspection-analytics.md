# Inspection analytics read budget

[Русский](inspection-analytics.ru.md)

Measured on 31 October 2026 from `0ea2385`, using the public strength service and the existing synthetic Firestore SDK boundary. Reproduce with Node 22: `node --test --test-name-pattern="sequential saves" tests/smoke/inspection-persistence.test.mjs`.

| Existing registry documents | New sequential saves | Full queries before / after | Documents returned by full queries before / after | Point reads before / after | Alias queries before / after |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 10 | 10 / 1 | 55 / 1 | 30 / 58 | 30 / 30 |
| 0 | 50 | 50 / 1 | 1,275 / 1 | 150 / 298 | 150 / 150 |
| 0 | 100 | 100 / 1 | 5,050 / 1 | 300 / 598 | 300 / 300 |
| 1,000 | 100 | 100 / 1 | 105,050 / 1,001 | 300 / 598 | 300 / 300 |

The measured series creates previously absent identities. Point reads include absent source/registry transaction reads and the additional pre-query project read. Alias queries return no existing aliases in these fixtures; empty queries can still incur minimum Firestore charges. Transaction retries/index reads/production latency and monetary billing are not measured. Synthetic elapsed times were approximately 4/17/50/611 ms before and 1/12/33/409 ms after; these are adapter/CPU observations, not Firebase latency claims. Small saves cost an additional project read. Existing-identity updates/deletions are deliberately not optimized.

## Safety boundary

The measurement proves repeated full scans dominate growing append series. The selected optimization updates the **existing** analytics projection only when a new identity is proven, in the same Firestore transaction as the source and registry documents. It introduces no in-memory catalog cache or separate aggregate store.

The full rebuild writes an optional `inspectionSync.analyticsRevision` provenance marker only after its existing revision check succeeds and every registry identity is discoverable by exact alias queries. Numeric/whitespace source IDs, sourceDocIds and whitespace fallback document IDs disable this marker. Old documents do not need migration: without matching provenance, the first save follows the old pending/full-rebuild path. Old clients change the revision without updating this marker, naturally disabling the optimization until a new verified rebuild.

For the fast path, the project revision is read **before** the three existing alias queries. All must find no documents, including foreign/legacy aliases. A transaction rechecks the same verified revision, `pending: false`, valid analytics structure and absence of both source and canonical registry documents. It atomically writes source, registry, updated analytics and a new revision/provenance marker. A race, existing source/alias or invalid analytics returns to the ordinary batch + durable pending + revision-checked rebuild path. A transaction error propagates; ambiguous acknowledgement is safely retried with the same identity.

The full calculator and append contribution share pure status/module/timestamp aggregation rules. Only canonical new IDs and already resolved projection inputs qualify. Firestore transforms such as `serverTimestamp()` and `increment()` take the persisted-data rebuild path. Updates, deletion of the latest timestamp, bulk deletion, legacy aliases, unverified/pending analytics and malformed aggregate metadata retain the full rebuild. No invalidation assumptions or decrement logic are introduced.

Regression coverage includes the scan budget, literal totals/status/maximum timestamp, comparison with full reconstruction, failed atomic writes, lost acknowledgements, noncanonical legacy identities, invalid/missing provenance and project separation. Real Firestore emulator tests cover concurrent transactions, sequential no-rescan saves, foreign-user denial, persisted transforms and the existing interruption/recovery paths. No rules, source identities, evaluation criteria or production data are changed. Demo persistence keeps its existing full-rebuild behavior.

Remaining cost: repeated updates/deletions and ambiguous legacy projects still scan the full registry. Broader incremental maintenance is not justified by the append measurements and is intentionally deferred.
