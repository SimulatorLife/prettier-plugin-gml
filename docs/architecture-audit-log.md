# Architecture Audit Log

This log consolidates each architecture audit so contributors can scan the
ongoing refactors in one place. When running a new audit, append a section to
this file with the latest date and keep the prior entries intact for context.

> NOTE: The scheduled `codex-78-architectural-audit` workflow and any manual
> audit runs must append their findings here. Include a `## YYYY-MM-DD — …`
> heading so each entry remains easy to cross-reference.

## 2025-10-23 — Architecture Audit

### Current layout pain points

- The `src/cli/src/shared/` directory mixes unrelated concerns: cross-cutting
  helpers live alongside modules that expose runtime tuning knobs for the CLI
  wrapper.
- The runtime option modules (`byte-format`, `skipped-directory-sample-limit`,
  `unsupported-extension-sample-limit`, and `vm-eval-timeout`) repeat the same
  integer option scaffolding and error messaging in isolation, making the
  directory harder to scan and inviting divergence.
- Having configuration helpers masquerade as "shared" primitives buries the fact
  that they depend on CLI-specific infrastructure such as
  `createIntegerOptionToolkit`, slowing discovery during audits.

### Target architecture

- Collect runtime configuration knobs for the CLI under a dedicated
  `src/cli/src/runtime-options/` boundary so the shared package only exposes
  primitives that are safe to depend on from other layers.
- Factor the duplicated sample-limit boilerplate behind a
  `createSampleLimitToolkit` helper so future limits can be added by providing
  the descriptive labels, keeping validation logic centralized.
- Keep public APIs stable by continuing to export the same functions from the
  renamed modules; only the import paths change for internal callers.

### First-step refactor

- Relocate the four runtime option modules from `src/cli/src/shared/` to
  `src/cli/src/runtime-options/` and update all importers to match the new
  structure.
- Introduce `createSampleLimitToolkit` to de-duplicate the configuration
  scaffolding for sample limits and apply the helper inside both modules.
- Leave additional helpers (e.g., `ignore-path-registry`) under `shared/` for
  now; follow-up audits can migrate them once the new boundary proves useful.
  The `progress-bar` helper later graduated into the `runtime-options/` boundary
  alongside the rest of the CLI's configurable surfaces.

### Additional cleanup — 2025-10-26

- The redundant `src/cli/src/plugin-runtime/shared/` folder has been removed so
  the plugin runtime now consumes the same dependency barrel that the rest of the
  CLI uses.
- The transitional `src/cli/src/modules/shared*/` shims were deleted; CLI
  modules now import helpers directly from `src/cli/src/shared/` to avoid
  maintaining parallel surfaces.

## 2025-10-22 — Daily Architecture Audit

### Design rationale

- The CLI layer duplicated shared utilities behind the `src/cli/lib/shared/`
  directory. Each file in that folder simply re-exported helpers that already
  live under `src/shared/src/`, so contributors had to decide between two nearly
  identical module hierarchies when wiring new features. The audit trims the
  duplication down to a single `json-utils` compatibility shim while downstream
  packages migrate.
- Maintaining the re-export shims hid the actual ownership of the helpers and
  made it harder to discover the curated barrels added during earlier audits
  (`src/shared/src/utils.js` and `src/shared/src/ast.js`). The wrapper layer also
  encouraged new micro-modules whenever the CLI needed one more helper, which
  increased the surface area without adding functionality.
- The target architecture keeps shared logic centralized under
  `src/shared/src/` with feature-focused barrels. Call sites across the CLI,
  parser, and plugin should import directly from those barrels instead of
  introducing more compatibility shims inside feature packages.

### Target layout

- Collapse `src/cli/lib/shared/` to a single compatibility shim so existing
  downstream consumers can still import `json-utils` while the CLI moves to the
  canonical `src/shared/src/` barrels.
- Update existing CLI modules (`manual` helpers, shared dependency aggregator,
  suite helpers, etc.) to use the barrels directly. This preserves the public
  helper APIs while reducing the number of intermediate files contributors must
  inspect and keeps the compatibility shim scoped to the remaining
  `json-utils` re-export.
- Keep the historic `src/shared/src/*-utils.js` shims in place so other packages
  that still rely on the transitional paths continue to work. The CLI no longer
  depends on them, which moves the repo closer to removing those shims in a
  follow-up.

### Migration and fallback plan

- This refactor only touches the CLI package and updates its imports. The shared
  helper implementations and exports remain unchanged, so rolling back to the
  pre-refactor state simply requires pointing the CLI back at the compatibility
  shim or reintroducing any re-export files if new consumers appear before the
  shims are removed entirely.
- If a CLI module unexpectedly requires a helper that is not yet surfaced
  through the barrels, we can add a focused export to the appropriate
  `src/shared/src/utils/` or `src/shared/src/ast/` module without re-creating the
  shim directory.
- Full lint and test suites (`npm run lint` and `npm test`) validate the
  refactor. The CLI package continues to be exercised through its existing test
  matrix, ensuring behaviour stays intact after the import updates.

### Follow-up opportunities

- Continue migrating parser and plugin modules away from the `*-utils.js`
  shims now that the CLI demonstrates how to rely on the barrels. Once no
  external packages import the compatibility wrapper, delete
  `src/cli/lib/shared/json-utils.js` and retire the directory for good.
- Consolidate documentation to reference the barrels as the preferred import
  surface so new contributors follow the streamlined structure by default.

## 2024-05-15 — Daily Architecture Audit

### Design rationale

- The `src/shared` directory still exposes a wide collection of thin re-export
  shims such as `array-utils.js`, `ast-node-helpers.js`, and `string-utils.js`.
  Each shim delegates to an implementation in either `src/shared/src/utils/` or
  `src/shared/src/ast/`. The duplication keeps legacy import paths alive but
  forces new code to pick between multiple entry points for the same helpers.
- Call sites across the parser, plugin, and CLI layers mix the shimmed paths
  (`../shared/array-utils.js`) with the grouped modules (`../shared/utils/…`).
  This split surface area obscures which modules belong together and makes the
  eventual removal of the shims risky because every import must be located by
  hand.
- The intended architecture, documented in `docs/shared-module-layout.md`, is
  for feature code to import from barrel files (`src/shared/src/ast/` and
  `src/shared/src/utils/`) while the compatibility shims fade into the
  background. The project has not yet made the pivot, so contributors still
  experience the pre-refactor sprawl.

### Target layout

- Introduce top-level barrels, `src/shared/src/ast.js` and `src/shared/src/utils.js`,
  that re-export the curated helper sets. These files provide a concise and
  discoverable entry point without removing the existing compatibility shims.
- Update a first wave of call sites (the CLI utilities and parser helpers) to
  consume the new barrels. This establishes a clear pattern the rest of the
  codebase can follow during future cleanups.
- Keep the `*-utils.js` and AST shim files untouched so third-party consumers or
  unpublished feature branches depending on the old paths continue to work.

### Migration and fallback plan

- This PR migrates a representative set of high-traffic modules to the new
  barrels while retaining the shims. If unexpected regressions surface we can
  revert individual imports back to their previous path without backing out the
  structural change.
- Once the majority of the repository adopts the barrels we can delete the
  shims in a follow-up. Until then, both styles coexist and guarantee backward
  compatibility.
- The build, lint, and test suites serve as the primary safety net. We will run
  `npm test`, `npm run lint`, and the plugin snapshot suite before pushing to
  confirm the refactor keeps the project stable.
