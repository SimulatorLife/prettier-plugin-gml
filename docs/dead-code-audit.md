# Dead Code Audit Notes

- 2025-10-13: Removed the unused `src/parser/tests/test-parser-benchmarks.js` script.
  - The parser workspace already exposes `npm test` through Node's built-in test runner, so this manual benchmark harness was no longer maintained or referenced by any package scripts.
  - Eliminating the script avoids carrying stale benchmarking entry points that could confuse contributors during future audits.
