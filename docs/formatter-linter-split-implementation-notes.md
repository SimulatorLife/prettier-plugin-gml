# Formatter/Linter Split Implementation Notes

## Scope Implemented In This Changeset
- Added a new `@gml-modules/lint` workspace scaffold at `/Users/henrykirk/gamemaker-language-parser/src/lint`.
- Added initial `Lint` namespace surface (`plugin`, `configs`, `ruleIds`, `services`) and baseline wiring.
- Added frozen `PERFORMANCE_OVERRIDE_RULE_IDS` constant in `/Users/henrykirk/gamemaker-language-parser/src/lint/src/configs/performance-rule-ids.ts`.
- Added CLI `lint` command scaffold in `/Users/henrykirk/gamemaker-language-parser/src/cli/src/commands/lint.ts` and registered it in the CLI command registry.
- Added initial lint workspace tests and updated command-name/dependency policy tests.

## Contract Compliance Status
- Implemented as **foundation only**; this is not a full migration completion.
- The pinned plan remains the source of truth for required behavior.
- No pinned contract was intentionally changed in this implementation notes pass.

## Verified Checks In This Environment
- `pnpm -r --filter @gml-modules/lint --filter @gml-modules/cli build:types` passes.
- `@gml-modules/lint` local tests pass.

## Known Limitations / Remaining Work
- Full rule migration matrix (`gml/*` + `feather/*`) is not yet implemented.
- Full ESLint v9 language contract suite and parser-services invariants are not yet fully implemented.
- Full project-context registry lifecycle (`--project`, `--project-strict`, multi-root, capabilities gating) is not yet implemented.
- Full overlay guardrail semantics and all pinned integration tests are not yet complete.
- Workspace install/linking was not validated in this environment because network access prevented `pnpm install`.

## Environment Constraints Encountered
- Network-restricted environment blocked package registry access, so dependency relink via `pnpm install` could not be completed.
