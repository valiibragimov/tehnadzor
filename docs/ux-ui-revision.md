# UX/UI revision — Tehnadzor

[Русский](ux-ui-revision.ru.md) | [English](ux-ui-revision.md)

Baseline: `44d96e647b01744a4d549cdf8059a0e9cfddd0fb`.

## Scope

Improve the existing interface, prioritizing Geodesy, Reinforcement, Geometry and Concrete strength. Use the existing `design` layer and components; preserve IDs, event contracts, calculations, normative values, permissions, business logic and stored data. No new dependencies or deployment.

- Consistent field dimensions, spacing, headings and project/actual pairs.
- Parameters first on desktop; saved inspections alongside. Retain mobile steps and native dialogs. Place check/reset actions with the form; keep list deletion with saved records.
- Bounded vertical textarea resizing and wrapping for long content.
- Native selects retain their values and handlers. Reveal truncated selected names through an accessible, keyboard-operated shared popover; retain RU/EN.
- Apply common overflow, contrast and date/checkbox fixes to supporting pages. Preserve profile renaming behavior. Keep the existing documentation page reachable from mobile and collapsed navigation.

## Captured audit

1. Object context: clipped construction names without a full-name action; compact header language could clip. Fixed with bounded selects and an explicit reveal action.
2. Engineering input: inconsistent nested labels/fieldsets, misplaced actions and misaligned coordinate pairs. Standardized in the shared design layer and original HTML partials.
3. Evidence/comments: unrestricted resizing and low-contrast saved values/date segments. Bounded controls; semantic theme colors.
4. Supporting surfaces: oversized narrow-screen demo notice and inspection menu unavailable at 761–768 px. Corrected flex sizing and aligned breakpoint.

Screenshots are local review artifacts under `output/playwright/ux/` and are not source assets. Initial captures use the local synthetic demo; authenticated production data was not accessed.

## Verification

Browser widths: 320, 390, 768, 1024 and 1440 px, light/dark, reduced motion. Verify bounds, paired fields, actions, full-name reveal via keyboard/Escape, unchanged selected project and stored evidence, bounded textarea and dialog reopen values. Reuse existing UI scenarios for dynamic construction rows, BIM, persistence, other pages and RU/EN. This is targeted accessibility verification, not a formal WCAG certification.
