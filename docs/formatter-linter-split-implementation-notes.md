# Formatter/Linter Split Implementation Notes

## Snapshot (2026-02-14)

- Migration infrastructure exists, but the lint migration is **not complete** and currently inconsistent across workspaces.
- `@gml-modules/lint` currently has scaffolding for contracts/config surfaces, but rule runtime behavior is not aligned with the pinned plan.
- `@gml-modules/plugin` still exposes legacy semantic/fix options and transform surfaces, which conflicts with the formatter-only target.

## Verified Current State

- Workspace split exists:
  - `@gml-modules/lint` workspace is present and exported.
  - CLI `lint` command exists at `src/cli/src/commands/lint.ts`.
- Lint namespace shape exists:
  - `Lint.plugin`, `Lint.configs`, `Lint.ruleIds`, `Lint.services`, and docs helpers are exported.
- Preset/config scaffolding exists:
  - `recommended`, `feather`, and `performance` arrays exist and are frozen.
  - `PERFORMANCE_OVERRIDE_RULE_IDS` exists.
  - Feather manifest schema/version and IDs are present.
- Language plugin exists and supports:
  - `language: "gml/gml"` wiring.
  - parse success/failure return channels.
  - `recovery: "none" | "limited"` option.
- Overlay guardrail helper logic exists in CLI and has targeted tests.
- Project-aware rule docs generation from metadata exists (`docs/generated/project-aware-rules.md`).

## Broken Right Now

- `@gml-modules/lint` test suite is currently failing.
  - Command run: `pnpm --filter @gml-modules/lint test`
  - Result: **5 failing tests**.
  - Failures include:
    - schema mismatch for `no-globalvar` in rule contracts.
    - fixture behavior failures (`prefer-loop-length-hoist`, `require-argument-separators`, `prefer-string-interpolation`, `no-globalvar`).

## Major Misalignments From `formatter-linter-split-plan.md`

- Rule runtime implementation mismatch:
  - `src/lint/src/rules/catalog.ts` builds plugin rules via `createNoopRule(...)` for all `gml/*` rules.
  - `src/lint/src/rules/gml/create-gml-rules.ts` contains behaviorful rules but is not wired into the exported plugin rule map.
  - Net effect: shipped lint rules are mostly metadata-only no-ops.
- Rule schema/message contract drift:
  - Examples:
    - `no-globalvar` schema in catalog is `[]` instead of `{ enableAutofix, reportUnsafe }`.
    - `prefer-string-interpolation` schema/options do not match plan contract (`reportUnsafe` expected).
    - `require-argument-separators` schema in catalog is `[]` while plan pins `{ repair }`.
- Parser services shape drift:
  - plan expects structured `recovery/directives/enums` objects with stable metadata fields.
  - current language service exposes empty `directives/enums` arrays and a recovery shape based on `originalOffset/recoveredOffset/insertedText`, not the pinned contract.
- Language implementation drift:
  - plan pins “no custom `SourceCode` subclass”.
  - current language uses `class GMLLanguageSourceCode extends SourceCode`.
  - `visitorKeys` is currently `{}`; extension-node visitor-key coverage from plan is not implemented.
- Project context capability model not implemented:
  - registry returns empty capability sets.
  - no semantic/refactor-backed indexing outputs are populated.
  - project-aware behavior therefore cannot satisfy intended safe-fix decision model.
- CLI contract drift:
  - overlay warning emission is gated by `--verbose`, while plan treats this as a standard guardrail warning.
  - no ESLint instance-identity startup assertion (CLI ESLint vs lint artifact ESLint/SourceCode identity).
  - processor observability/unsupported-processor contract is not implemented.
  - fallback warning text lacks the plan’s actionable hint wording (`--no-default-config` guidance).
- Formatter boundary not fully reflected in public surface:
  - plugin still exposes legacy semantic options (`optimizeLoopLengthHoisting`, `condenseStructAssignments`, `preserveGlobalVarStatements`, `useStringInterpolation`, `optimizeMathExpressions`, `sanitizeMissingArgumentSeparators`, `applyFeatherFixes`, etc.).
  - transform exports and runtime hooks for migrated behaviors still exist in plugin code.
  - there is some guard behavior to avoid applying migrated transforms, but API/options are still structurally present and misleading.

## Disorganization / Refactor Targets

- Duplicate/competing rule paths in lint workspace:
  - `src/lint/src/rules/catalog.ts` (scaffold/no-op runtime path).
  - `src/lint/src/rules/gml/create-gml-rules.ts` (behavior path, currently unused).
- Dead/placeholder rule surface:
  - `src/lint/src/rules/noop.ts` remains as standalone scaffold and contributes to ambiguity.
- Tests currently mix contract metadata checks and behavior fixtures against a runtime that is not wired to the behavior implementations.
- Existing `eslint-disable` comments remain in `src/cli/src/commands/lint.ts`, which is contrary to repository lint governance policy.

## Remaining Work (Prioritized)

1. Restore a single authoritative lint rule runtime path.
2. Wire exported plugin rule map to real rule implementations (or remove unfinished implementations until ready).
3. Align all rule schemas/message IDs/options with pinned migration matrix.
4. Make `@gml-modules/lint` tests green (`pnpm --filter @gml-modules/lint test`) before expanding coverage.
5. Implement pinned parserServices contract (`recovery`, `directives`, `enums`) with stable shapes.
6. Remove custom `SourceCode` subclass and align language object behavior with pinned contract.
7. Implement project-context indexing and capabilities using semantic/refactor outputs (or explicitly gate unavailable capabilities with deterministic missing-context behavior).
8. Complete CLI contract parity:
   - overlay guardrail emission policy,
   - actionable fallback messaging,
   - processor observability handling,
   - ESLint identity assertion.
9. Complete formatter boundary cleanup:
   - remove migrated semantic options from plugin public options,
   - remove/relocate legacy transform exports that belong to lint,
   - update plugin tests/fixtures to formatter-only responsibility.
10. Reconcile migration docs with actual shipped behavior after the above refactors land.
