# Tehnadzor engineering revision specification

[Русский](engineering-revision.ru.md)

Date: 2026-10-24. Status: all four decisions and TDD boundaries confirmed by the user; implementation under verification. Review baseline: `de0eea5aa09b41a7354664b1cdb7a4f6fcec09a4`.

## Scope and acceptance

Audit every category, construction and subtype across Geodesy, Reinforcement, Geometry and Concrete Strength: input, calculations, normative basis, status, persistence, reopening, editing, BIM and RU/EN. Factory control and non-applicability must not imply successful site inspection.

Add an As-built Documentation section for PDF concealed-work certificates, as-built drawings, certificates, product passports and laboratory reports, linked to existing project, construction and inspection identities. Provide authenticated storage, file validation, immutable versions and access enforcement. Proposed storage: Firebase Storage plus Firestore metadata, without permanent public download links. Participant permissions require agreement.

Add design/actual physical dimensions for foundations, walls, pylons, slabs, beams, elevator shafts and stair cores. Flights and landings need length and width. Keep section, step and construction physical heights; keep elevation levels in Geodesy. Separate shaft clear dimensions from individual wall length, physical height, thickness and applicable deviations. Remove duplicate common shaft inputs while retaining shared letter/number axes. Stair cores retain shared axes and exact element locations. Hidden legacy fields remain preserved in saved records.

Geodesy coordinates/elevations use metres; deviations/tolerances use millimetres. Convert BIM units at form boundaries. Never infer legacy units from magnitude or silently rescale records. Unknown units cannot produce automatic compliance.

Compliance requires all applicable mandatory measurements and confirmed evaluation conditions. Incomplete or normatively uncertain inspections cannot pass. Show a confirmed violation even when other measurements are incomplete, explicitly retaining that incompleteness.

Verify each tolerance against its document, clause/table, revision, effective date and applicability conditions. Support asymmetric limits and project requirements; never substitute universal values when context is missing. This proposal approves no numeric normative limits.

Remove normative concrete acceptance based on the universal logarithmic age curve. Agree whether acceptance uses a confirmed laboratory assessment or a complete GOST scheme calculation with required inputs. Distinguish pile concrete from grillage concrete; a steel screw pile must not inherit concrete testing without a corresponding concrete element.

## Confirmed preliminary defects

- Geodesy evaluation and journal use raw coordinate differences despite metre-labelled inputs and millimetre tolerances.
- Reinforcement accepts one complete pair while treating missing pairs as successful.
- Geometry allows any complete pair to satisfy completeness.
- Strength uses `lg(t)/lg(28)` and the registry incorrectly attributes it to GOST 18105-2018 clause 5.6.
- Factory pile overrides change reinforcement/geometry but retain generic concrete strength evaluation.
- Firestore access is owner-only; participant access and protected PDF storage are absent.

These are preliminary code findings, not a completed scenario audit.

## Proposed TDD boundaries, awaiting confirmation

- Public evaluation functions: units, completeness, limit boundaries, applicability and normative uncertainty; excludes UI/storage.
- Public save/load services and emulator rules: stable identities, history, legacy compatibility, document versions and denied foreign access; excludes production.
- Browser workflows: input, evaluation, save, reopen, edit, BIM and RU/EN; complements calculation and rules tests.

## Delivery stages

1. Geodesy units, completeness, honest statuses and legacy compatibility.
2. Geometry dimensions, shaft/stair forms, editing, persistence and BIM.
3. Normative conditions, pile applicability and agreed strength assessment.
4. PDF storage, permissions, versions and existing-screen integration.
5. Required AGENTS.md checks; independent Standards/Spec reviews; fixes; coherent commits and pushes to main with CI monitoring.

Each implementation slice follows confirmed-boundary failing test, minimal implementation and targeted verification. Run the complete required checks after integration; repeat only when changes or failures warrant it.

Preserve Firestore contracts, IDs, inspection history, BIM and RU/EN. No live migrations, real-data changes or production deployment. Avoid unnecessary dependencies. Exclude pre-existing hosting/generated-file changes from revision commits.

## Initial normative sources

- [Rosstandart: SP 70.13330.2012 and amendments](https://protect.gost.ru/sp/details/2239acf1-711f-4f1f-aaa7-902fa06a8a60).
- [Rosstandart: amendment 4 to SP 45.13330.2017, including deferred provisions](https://protect.gost.ru/sp/changesdetails/af748f79-c5de-443b-a10f-7542d35b9bce).
- [Rosstandart: GOST 18105-2018](https://protect.gost.ru/gost/details/04422c90-ca4a-4faf-913d-528944ce5e4f).
- [GOST 18105-2018 text on mos.ru](https://www.mos.ru/upload/documents/files/2071/GOST18105-2018.pdf): section 8 ties assessment to test method, scheme and sampling.

## Accepted applicability matrix

Foundations retain length/width/physical height or slab thickness. Bored piles use diameter/physical height and cage reinforcement with stirrup spacing. Driven RC piles use factory geometry/reinforcement/concrete documentation; steel screw piles do not receive concrete acceptance. Grillage remains a separate site inspection for every pile subtype.

Walls/pylons retain length, physical height, thickness, verticality, flatness and dimensions of existing openings. Columns use two section dimensions, physical height and verticality. Slabs use length, width, thickness and flatness. Beams add length to section dimensions and include stirrups. Shafts separate clear dimensions from individual walls. Stair cores retain shared axes and precise element positions: flights/landings have length and width, with step checks only for flights. Formwork retains physical dimensions/applicable deviations and does not inherit reinforcement or concrete control.

Geodesy uses metre coordinates/elevations and millimetre deviations/signed limits. Factory control does not replace installed-pile surveying. Legacy units are not inferred from magnitude. Historical results remain stored while current summaries distinguish evaluations produced with explicit criteria. A historical issue closure alone cannot establish successful repeat control.

Old universal numeric defaults no longer supply normative acceptance. SP 70 conditions differ by reinforcement/acceptance parameter; SP 45 pile limits depend on pile type, diameter and arrangement; GOST 18105 assessment depends on method, scheme and sampling. Project-specific requirements/evidence are absent from this repository. Accordingly, numeric limits require a stated basis and explicit applicability confirmation; missing/unconfirmed criteria cannot pass. The complete GOST scheme calculator remains excluded by agreement.

See [private document storage setup](document-storage.md). No real data changes or production deployment are performed.
