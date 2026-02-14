# Formatter/Linter Split Implementation Notes

## Pinned-contract compliance decisions

- Kept formatter behavior layout-only and documented migration ownership to lint rules (`gml/no-globalvar`, `gml/prefer-loop-length-hoist`, `gml/require-argument-separators`, `gml/normalize-doc-comments`).
- Added metadata-driven publication flow for project-aware rules from `meta.docs.requiresProjectContext`.
- Added dependency policy checks to enforce plugin-only formatter dependency ownership.
- Added CI contract coverage for lint workspace tests across minimum/latest ESLint `<10` and CLI nested `node_modules` integration.

## ESLint-behavior deviations (unavoidable)

- Overlay guardrail diagnostics remain a CLI-level compatibility warning (not a native ESLint core error) to preserve flat-config interoperability; regression coverage remains in `src/cli/test/lint-overlay-guardrail.test.ts`.
- Project-context availability remains rule-metadata driven with per-file missing-context suppression behavior; regression coverage remains in `src/lint/test/rule-contracts.test.ts` and `src/lint/test/project-aware-rules-docs.test.ts`.
