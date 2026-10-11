[Русский](bim.ru.md) | [English](bim.md)

# BIM and IFC

IFC provides context for inspections, including element identity, location and available design values. Import and 3D rendering are separate paths: seeing a shape in the viewer does not mean its engineering dimensions can be extracted.

## Import

[src/shared/bim/ifc-model.ts](../src/shared/bim/ifc-model.ts) is the shared WebIFC adapter. WebIFC decodes STEP entities and references. The adapter maps them into [engineering records](../src/shared/bim/types.ts), with lengths and coordinates normalised to millimetres.

The same adapter runs in a browser Worker and the server's Piscina pool. The server API accepts raw IFC bytes; request and response definitions are in [OpenAPI](../api/openapi.json). Processing has input, entity, queue and execution limits. No GPU is required for metadata import.

Supported inspection categories include slabs, columns, walls, beams and stairs. Records can include:

- Stable element identity, source model ID and IFC GUID.
- Mark, axes and floor, where the source data provides them.
- Project X, Y and elevation from supported placement chains.
- Declared dimensions such as thickness, width, height and section sizes.

Missing or unsupported values stay `null`. Dimensions are not estimated from rendered bounding boxes. Survey and geometry forms can use supported coordinates and dimensions; reinforcement and strength checks can retain element context without inventing measurements.

Saved checks keep a BIM binding snapshot. Removing or replacing a model does not delete the original inspection evidence; a reference may become unavailable in the current catalog.

## Coordinates and format coverage

The adapter handles project/property length units, nested local placement transforms, property sets and storey relationships. Invalid coordinate tuples are rejected instead of being repaired heuristically.

Tests cover browser/Node parsing parity, Body and Axis representations, nested rotations with large coordinates, mapped geometry and boolean bodies. Mapped and boolean dimensions remain unknown when extraction is unsupported.

IFC Grid/LinearPlacement, MapConversion, complex property structures and dimensions from some tessellated bodies are not fully supported. Do not assume imported coordinates include every exporter-specific georeferencing transform. Check critical values against the design model.

The legacy cottage fixture has malformed decimal-comma tuples and is kept for diagnosis. Viewer tests use valid synthetic fixtures; this is not evidence of complete real-world exporter coverage.

## Model publication

The shared [publication policy](../src/shared/bim/publication.ts) is used by browser and Admin storage adapters.

1. Register a generation and stage its elements in bounded batches.
2. Validate the expected count and publish a versioned manifest transactionally.
3. Compare model revisions and project epochs so stale imports cannot overwrite newer state or restore a deleted model.
4. Record an immutable publication receipt with the generation and expected element count.

New storage uses `bimModels` manifests, `bimGenerations` registry records and `bimPublications` receipts under the project. Legacy `elements` stay readable until their model is replaced or explicitly hidden. Unknown manifest versions fail closed.

Readers fetch at most 200 elements per page. They acquire a catalog revision and a renewable five-minute `bimReaders` lease that pins immutable generations. Publication, reader acquisition and collection coordinate through a root revision. Renewals update the reader's own lease; expired readers fail closed if their generation has been collected.

The browser requires server reads for this protocol, rather than cached query fallbacks. It shares one immutable project catalog across features. This avoids duplicate catalogs, but still uses memory proportional to the element count. Selectors render at most 100 matches while searching the full catalog.

## Cleanup and recovery

Cleanup is an explicit maintenance command, with no deployed background schedule. It retains replaced generations for 24 hours after retirement and unfinished imports for one hour after their last heartbeat.

After `npm run build:server:ts`, inspect registry status for an explicitly selected **test** project:

```sh
npm run bim:gc -- --firebase-project YOUR_TEST_FIREBASE_PROJECT --project YOUR_TEST_PROJECT_ID
```

The default is read-only: it reports registered status counts and retention settings, not an exact deletion preview. The command uses Application Default Credentials outside the emulator. Emulator access requires a loopback host and a `demo-` Firebase project ID.

Adding `--apply` runs collection and deletes eligible generation chunks. The collector rechecks the coordination revision and reader leases transactionally, fences staging writers, and marks a generation deleting before removing bounded chunks. Interrupted deletion can resume.

Receipts and purged registry tombstones remain for diagnosis. A receipt does not make deleted chunks recoverable. Recovery requires selecting a successful receipt, checking that its complete generation still exists, and republishing it. Returning to the legacy reader requires projecting the selected snapshot into `elements` first; there is no automatic rollback.

Unregistered generations are deliberately retained. Before adopting them, quiesce old Admin writers and verify successful receipts. Admin SDK writers bypass Firestore rules: backend, rules and browser rollout must be coordinated. Never infer that an unregistered generation is safe to delete.

## Verification and limits

[Firestore Emulator tests](../tests/integration) cover staging failure, concurrent publication, deletion races, cleanup, leases and owner isolation using synthetic data. [Browser tests](../tests/ui) cover real worker import and viewer lifecycle.

The viewer releases its parsing store after scene construction and disposes controls, scene, renderer and WebGL context on close. Geometry loading is still not streamed. Larger exporter fixtures, peak-memory measurements and disk-backed metadata indexing remain future work.
