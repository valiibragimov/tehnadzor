# Workspace lifecycle boundary

[Русский](workspace-lifecycle.ru.md)

Stage 7 investigation from `9427044`, 31 October 2026. Production `app.ts` creates one bridge/context per document. Navigation and legacy features use fixed document-wide IDs. ES module configuration in journal/summary/geometry is therefore currently document-scoped, not an independently mountable multi-workspace API.

## Confirmed change

Repeated calls to the same bridge's public `initNavigation()` fired two extra activation events and replaced bottom-navigation elements. The real-browser regression reproduced `{ activations: 2, sameItem: false }`; after the fix it observes `{ activations: 0, sameItem: true }`. Initialization state now belongs to the module runtime closure, alongside that workspace's lazy promises. DOM-ready initialization remains deferred. A synchronous setup failure clears the flag for retry. Reinitialization still asks the existing tab loader to retry a failed lazy load, without rebinding navigation or emitting another activation.

Twenty-two bridge functions only forwarded to an identically named runtime method. They now alias those functions directly; the bridge retains its inspection adapters and its original public action names/defaults/fallbacks. Runtime construction allocates only closures/maps; it imports no feature module and queries no DOM. Dynamic imports/configuration still happen in the existing loader methods, with their error/reset handling unchanged. No new registry, framework, global state bridge or per-workspace module-URL cache was introduced.

## Evidence and limits

`tests/ui/workspace-lifecycle.test.mjs` runs actual bridge/runtime and feature implementations with existing synthetic demo persistence/vendor boundaries. Test-only instrumentation exposes the public bridge and counts module evaluation. It checks repeated initialization and DOM identity; bridge construction without feature evaluation; concurrent geometry actions evaluating the module once; fallback after an action error and a successful subsequent action; and two documents in the same browser context, on different projects, preserving separate journal filters and correct journal→source geometry navigation. Both documents share persisted storage intentionally, while their live context/ES module state remains separate. Existing workspace UI tests cover ordinary navigation, mobile controls and form persistence.

Action failure is exercised directly; a real transport-level dynamic-import failure is not injected by this bundled demo fixture. Promise reset paths were preserved by inspection, not claimed as a new network-retry experiment.

Two full workspace contexts controlling the **same document** remain unsupported: global DOM IDs, legacy configure state and existing listener lifetimes would require per-instance feature factories and explicit DOM/disposal contracts. Merely serializing configure calls or cache-busting import URLs would not safely isolate asynchronous operations and would add retention risks. This change does not claim to make those contexts safe, nor replace journal/summary state with a new registry. That part of the original P3 debt remains open until an actual same-document remount/multi-workspace requirement is established. The supported two-window scenario passed and does not justify a mass legacy-module rewrite.
