# Formatter/Linter Split Implementation Notes

## Snapshot (2026-02-14)

- Formatter/linter split is materially advanced and now aligned on the core direction: formatter behavior is strict/layout-first, lint owns migrated semantic/content rewrites.
- Plugin workspace tests are passing with no skips; lint workspace tests were previously verified green in this migration stream.
- Legacy formatter-lint coupling has been reduced further by removing migrated formatter surface/options and by cleaning legacy-coupled plugin tests.

## Completed Since Prior Snapshot

- Lint rules are wired through real `gml/*` implementations (instead of no-op scaffolding), with schema/capability alignment updates in rule catalog and helpers.
- Project context registry now builds an index-backed context (identifier occupancy and occurrence helpers, rename planning hooks, and globalvar rewrite assessment hooks).
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

## Test Migration Status

- `src/plugin`:
  - `pnpm --filter @gml-modules/plugin test` passes.
  - Result: `pass 222`, `fail 0`, `skipped 0`.
- Skipped-test audit:
  - Search: `rg -n "skip\\(|test\\.skip|it\\.skip|describe\\.skip" src`
  - Result: no matches.
- CLI skip-path cleanup:
  - Symlink traversal test no longer uses `t.skip()` when symlink creation is unavailable; it now asserts deterministic behavior in both environments.

## Current Misalignment / Remaining Work

1. Root-level test partitioning is still incomplete.
   - Some CLI tests currently fail due pathing/integration assumptions that should be normalized as true integration tests (or fixed to stay workspace-local without cross-workspace fixture coupling).
2. CLI module export hygiene needs follow-through after split.
   - Removed stale `modules/feather` export reference; complete verification needed to ensure no remaining stale namespace exports across workspace boundaries.
3. Plan parity validation pass is still needed against the full pinned contract in `docs/formatter-linter-split-plan.md`.
   - Especially public API semver surfaces (`Lint.configs`, `Lint.ruleIds`, language/parser services contract details) and final docs parity.

## Immediate Next Execution Steps

1. Finish CLI/integration test repartitioning:
   - keep workspace-unit tests local to each workspace;
   - move cross-workspace assertions to root integration tests.
2. Fix remaining CLI failing tests tied to split-era path assumptions and hot-reload timing flakiness.
3. Run full repository test/lint/typecheck sweep and refresh this document with final “fully complete” evidence.
