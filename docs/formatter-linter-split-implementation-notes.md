# Formatter/Linter Split Implementation Notes

## Snapshot (2026-02-14)

- Formatter/linter split migration is now functionally complete for the pinned plan direction:
  - formatter is strict/layout-first and does not expose legacy semantic/refactor adapter hooks;
  - lint owns migrated semantic/content rewrite responsibilities.
- `plugin`, `lint`, and `cli` workspace test suites are passing with zero skipped tests.
- Legacy formatter-lint adapter integration paths were removed from active runtime wiring and tests.

## Completed Since Prior Snapshot

- Lint rules are wired through real `gml/*` implementations (instead of no-op scaffolding), with schema/capability alignment updates in rule catalog and helpers.
- Project context registry now builds an index-backed context (identifier occupancy and occurrence helpers, rename planning hooks, and globalvar rewrite assessment hooks).
- Project context indexing now normalizes identifier matching by canonical lowercase keys for occupancy/occurrence/planning parity across files.
- CLI lint guardrail behavior/messageing was tightened (overlay warning policy and fallback messaging improvements).
- Formatter public option metadata removed migrated semantic/lint options:
  - `applyFeatherFixes`
  - `preserveGlobalVarStatements`
  - `optimizeLoopLengthHoisting`
  - `loopLengthHoistFunctionSuffixes`
  - `condenseStructAssignments`
  - `useStringInterpolation`
  - `optimizeLogicalExpressions`
  - `optimizeMathExpressions`
  - `sanitizeMissingArgumentSeparators`
  - `normalizeDocComments`
- Parser-adapter tests were moved to strict behavior (malformed input now fails; no parse-repair expectations).
- Legacy plugin tests that validated migrated semantic transforms were removed from formatter workspace coverage.
- Formatter fixture coverage was refocused to explicit formatter-owned paired fixtures only.
- Plugin printer no longer consults semantic-safety runtime for `globalvar` rewriting; formatter preserves keyword statements as formatter-owned syntax output.
- CLI plugin runtime configuration now wires identifier-case integration only; semantic/refactor runtime adapter wiring was removed.
- Plugin transform public index no longer exports migrated feather/math/separator/loop-hoist migration helpers from formatter-facing surface.

## Test Migration Status

- `src/plugin`:
  - `pnpm --filter @gml-modules/plugin test` passes.
  - Result: `pass 219`, `fail 0`, `skipped 0`.
- `src/lint`:
  - `pnpm --filter @gml-modules/lint test` passes.
  - Result: `pass 35`, `fail 0`, `skipped 0`.
- `src/cli`:
  - `pnpm --filter @gml-modules/cli test` passes.
  - Result: `pass 539`, `fail 0`, `skipped 0`.
- Skipped-test audit:
  - Search: `rg -n "skip\\(|test\\.skip|it\\.skip|describe\\.skip" src`
  - Result: no matches.
- CLI skip-path cleanup remains in place:
  - Symlink traversal test no longer uses `t.skip()` when symlink creation is unavailable; it asserts deterministic behavior for both capability paths.

## Remaining Follow-ups (Non-blocking)

1. Continue reducing dormant legacy implementation code under internal plugin transform modules that are no longer formatter-surface exports.
2. Keep direct ESLint docs and generated project-aware rule inventory in sync as lint rule internals evolve.
