# Dead Code Audit Notes

- 2025-10-13: Removed the unused `src/parser/tests/test-parser-benchmarks.js` script.
  - The parser workspace already exposes `npm test` through Node's built-in test runner, so this manual benchmark harness was no longer maintained or referenced by any package scripts.
  - Eliminating the script avoids carrying stale benchmarking entry points that could confuse contributors during future audits.
- 2025-10-14: Pruned the unused `statementShouldEndWithSemicolon` and `isAssignmentLikeExpression` helpers from `src/plugin/src/printer/util.js`.
  - Both utilities were vestiges of an earlier formatter strategy and have no remaining imports across the plugin codebase.
  - Removing them reduces the surface area of the printer utilities module and keeps future refactors focused on actively executed logic.
