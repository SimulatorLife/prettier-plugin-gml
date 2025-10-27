# Daily architecture audit – 2025-10-22

## Design rationale

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
- The target architecture keeps shared logic centralized under `src/shared/src/`
  with feature-focused barrels. Call sites across the CLI, parser, and plugin
  should import directly from those barrels instead of introducing more
  compatibility shims inside feature packages.

## Target layout

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

## Migration and fallback plan

- This refactor only touches the CLI package and updates its imports. The shared
  helper implementations and exports remain unchanged, so rolling back to the
  pre-refactor state simply requires pointing the CLI back at the compatibility
  shim or reintroducing any re-export files if new consumers appear before the
  shims are removed entirely.
- If a CLI module unexpectedly requires a helper that is not yet surfaced
  through the barrels, we can add a focused export to the appropriate
  `src/shared/src/utils/` or `src/shared/src/ast/` module without re-creating the shim
  directory.
- Full lint and test suites (`npm run lint` and `npm test`) validate the
  refactor. The CLI package continues to be exercised through its existing test
  matrix, ensuring behaviour stays intact after the import updates.

## Follow-up opportunities

- Continue migrating parser and plugin modules away from the `*-utils.js`
  shims now that the CLI demonstrates how to rely on the barrels. Once no
  external packages import the compatibility wrapper, delete
  `src/cli/lib/shared/json-utils.js` and retire the directory for good.
- Consolidate documentation to reference the barrels as the preferred import
  surface so new contributors follow the streamlined structure by default.
