# Formatter/Linter Split Implementation Notes

## Scope Implemented In This Changeset
- Added a new `@gml-modules/lint` workspace scaffold at `/Users/henrykirk/gamemaker-language-parser/src/lint`.
- Added initial `Lint` namespace surface (`plugin`, `configs`, `ruleIds`, `services`) and baseline wiring.
- Added frozen `PERFORMANCE_OVERRIDE_RULE_IDS` constant in `/Users/henrykirk/gamemaker-language-parser/src/lint/src/configs/performance-rule-ids.ts`.
- Added CLI `lint` command scaffold in `/Users/henrykirk/gamemaker-language-parser/src/cli/src/commands/lint.ts` and registered it in the CLI command registry.
- Added initial lint workspace tests and updated command-name/dependency policy tests.
- Implemented CLI overlay guardrail normalization helpers for:
  - resolved-config-only wiring detection (`plugins.gml` identity + `language`)
  - conservative rule-severity normalization (including non-crash fallback for unexpected shapes)
  - exact full-ID matching against `PERFORMANCE_OVERRIDE_RULE_IDS`
  - invocation-level deduped verbose warning output with bounded file-path sample
- Added typed Feather parity manifest scaffold and integrated manifest-derived Feather config/rule surfaces.
- Expanded `Lint.ruleIds`/`Lint.configs` scaffolding to include pinned baseline GML rule IDs and manifest-derived Feather IDs.
- Added unsafe-reason-code registry scaffold and project-aware rule metadata/capability declarations.
- Added missing-project-context helper with once-per-file emission behavior.
- Updated language parse channel to ESLint v9 `ok` discriminator form (`ok: true` success / `ok: false` parse errors).

## Contract Compliance Status
- Implemented as **foundation only**; this is not a full migration completion.
- The pinned plan remains the source of truth for required behavior.
- No pinned contract was intentionally changed in this implementation notes pass.

## Verified Checks In This Environment
- `pnpm -r --filter @gml-modules/lint --filter @gml-modules/cli build:types` passes.
- `@gml-modules/lint` local tests pass.
- Guardrail and rule metadata contract tests were added and pass in lint workspace test runs.

## Known Limitations / Remaining Work
- Full rule migration matrix behavioral implementations (`gml/*` + `feather/*` fixes/detections) is not yet implemented; many rules are metadata-complete scaffolds.
- Full ESLint v9 language contract suite and parser-services invariants are not yet fully implemented (visitor keys, recovery metadata, directive/enum extraction, token/comment invariants, failure-channel detail parity).
- Full project-context registry lifecycle (`--project`, `--project-strict`, multi-root, capability-driven context services) is not yet implemented.
- CLI integration coverage for the overlay guardrail is not fully complete due current workspace-link/runtime test constraints in this environment.
- Formatter workspace is not yet fully stripped of all semantic/refactor rewrite paths; additional migration work is required in `src/plugin`.
- Workspace install/linking was not validated in this environment because network access prevented `pnpm install`.

## Environment Constraints Encountered
- Network-restricted environment blocked package registry access, so dependency relink via `pnpm install` could not be completed.
