# Daily architecture audit – 2025-10-22

## Design rationale

- The CLI layer duplicated shared utilities behind the `src/cli/lib/shared/`
  directory. Each file in that folder simply re-exported helpers that already
  live under `src/shared/`, so contributors had to decide between two nearly
  identical module hierarchies when wiring new features.
- Maintaining the re-export shims hid the actual ownership of the helpers and
  made it harder to discover the curated barrels added during earlier audits
  (`src/shared/utils.js` and `src/shared/ast.js`). The wrapper layer also
  encouraged new micro-modules whenever the CLI needed one more helper, which
  increased the surface area without adding functionality.
- The target architecture keeps shared logic centralized under `src/shared/`
  with feature-focused barrels. Call sites across the CLI, parser, and plugin
  should import directly from those barrels instead of introducing more
  compatibility shims inside feature packages.

## Target layout

- Remove the `src/cli/lib/shared/` directory entirely so the CLI imports
  helpers from the canonical `src/shared/` barrels.
- Update existing CLI modules (`manual` helpers, shared dependency aggregator,
  suite helpers, etc.) to use the barrels directly. This preserves the public
  helper APIs while reducing the number of intermediate files contributors must
  inspect.
- Keep the historic `src/shared/*-utils.js` shims in place so other packages
  that still rely on the transitional paths continue to work. The CLI no longer
  depends on them, which moves the repo closer to removing those shims in a
  follow-up.

## Migration and fallback plan

- This refactor only touches the CLI package and updates its imports. The shared
  helper implementations and exports remain unchanged, so rolling back to the
  pre-refactor state simply requires reintroducing the deleted re-export files.
- If a CLI module unexpectedly requires a helper that is not yet surfaced
  through the barrels, we can add a focused export to the appropriate
  `src/shared/utils/` or `src/shared/ast/` module without re-creating the shim
  directory.
- Full lint and test suites (`npm run lint` and `npm test`) validate the
  refactor. The CLI package continues to be exercised through its existing test
  matrix, ensuring behaviour stays intact after the import updates.

## Follow-up opportunities

- Continue migrating parser and plugin modules away from the `*-utils.js`
  shims now that the CLI demonstrates how to rely on the barrels.
- Consolidate documentation to reference the barrels as the preferred import
  surface so new contributors follow the streamlined structure by default.
