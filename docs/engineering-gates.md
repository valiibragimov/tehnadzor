# Incremental engineering gates

[Русский](engineering-gates.ru.md)

Stage 8 pilot, 31 October 2026, baseline `c36954f`.

`npm run typecheck:engineering` uses `tsconfig.engineering.json` and is included in the existing `npm run typecheck`/CI gate. It enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `useUnknownInCatchVariables` for acceptance criteria, current assessment status, geometry dimension keys and geodesy evaluation. Imported geodesy/domain type contracts are checked too. It emits nothing, does not load ambient Node/DOM globals, and leaves the global legacy configuration unchanged.

Initial assessment found two unsafe indexed-access diagnostics in one geodesy expression. Named local values now let TypeScript verify the existing null guards; there are no non-null assertions, casts or suppressions. The current-status input uses `Record<string, unknown>` instead of `any`. A behavioral regression additionally exposed whitespace-only coordinates becoming numeric zero; they now remain incomplete, while actual zero remains valid. Stored identities, units, criteria and data formats do not change.

ESLint applies `no-explicit-any` and `no-non-null-assertion` to the selected leaves and all four feature engineering `evaluation.ts` modules. Known UI, runtime, service, repository, infrastructure and Firebase imports (including type imports/re-exports) are prohibited. Dynamic imports, CommonJS require and browser state globals are prohibited there too. Existing pure construction/inspection applicability contracts remain dependencies; they are not moved or claimed strict. This is a scoped boundary gate, not a complete repository dependency graph checker. Broader type-aware lint and global strict are intentionally deferred.

`tests/core/engineering-gates.test.mjs` exercises the actual ESLint/TypeScript CLIs with negative fixtures, requiring the specific restriction diagnostics. It checks rejection of null assignment, implicit any, unchecked array access and explicit undefined optional properties, as well as the real strict profile's success. `tests/core/engineering-contracts.test.mjs` exercises actual public calculators without mocking engineering logic: metres→millimetres, signed/asymmetric/boundary tolerances, missing/blank/nonfinite data, physical positivity, decimal comma, screw/bored pile applicability and incomplete beam dimensions.

The legacy `evaluateReinfCheck` facade is tested as the same function object as `evaluateReinforcementCheck`, rather than a second calculation. Review of the four evaluators and facade did not identify another complete duplicate evaluator; this is not a claim that every parser/formatting helper across the repository is unique. Different unit, locale and applicability contracts are retained; no common calculation framework was introduced.

Next rollout: assess the compiler closure of construction applicability, registry and remaining evaluators before making them strict. Main client/server still inherit the legacy base. Extend actual boundary checks with their next changes instead of weakening types or enabling strict globally without measuring fallout.
