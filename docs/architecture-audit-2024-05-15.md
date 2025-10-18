# Daily architecture audit – 2024-05-15

## Design rationale

- The `src/shared` directory still exposes a wide collection of thin re-export
  shims such as `array-utils.js`, `ast-node-helpers.js`, and `string-utils.js`.
  Each shim delegates to an implementation in either `src/shared/utils/` or
  `src/shared/ast/`. The duplication keeps legacy import paths alive but forces
  new code to pick between multiple entry points for the same helpers.
- Call sites across the parser, plugin, and CLI layers mix the shimmed paths
  (`../shared/array-utils.js`) with the grouped modules (`../shared/utils/…`).
  This split surface area obscures which modules belong together and makes the
  eventual removal of the shims risky because every import must be located by
  hand.
- The intended architecture, documented in `docs/shared-module-layout.md`, is
  for feature code to import from barrel files (`src/shared/ast/` and
  `src/shared/utils/`) while the compatibility shims fade into the background.
  The project has not yet made the pivot, so contributors still experience the
  pre-refactor sprawl.

## Target layout

- Introduce top-level barrels, `src/shared/ast.js` and `src/shared/utils.js`,
  that re-export the curated helper sets. These files provide a concise and
  discoverable entry point without removing the existing compatibility shims.
- Update a first wave of call sites (the CLI utilities and parser helpers) to
  consume the new barrels. This establishes a clear pattern the rest of the
  codebase can follow during future cleanups.
- Keep the `*-utils.js` and AST shim files untouched so third-party consumers
  or unpublished feature branches depending on the old paths continue to work.

## Migration and fallback plan

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
