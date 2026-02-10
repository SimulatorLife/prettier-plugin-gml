# Formatter/Linter Split Plan

## Summary

This plan splits the current `@gml-modules/plugin` behavior into:

1. A formatter-only Prettier package (layout/style printing only).
2. A separate feather-fixer/linter package (rule diagnostics + optional `--fix`), including project-aware scope analysis.

Both are intended to be **separate, top-level monorepo workspaces/modules** (siblings under `src/`, not nested inside each other).

The target is to make semantics-changing rewrites explicit lint rules with severity (`"off" | "warn" | "error"`), while keeping formatting deterministic and fast.

## Goals

- Keep formatting and semantic/code-quality concerns separate.
- Support ESLint-like rule severity and CLI behavior (`warn`/`error`/`off`, `--fix`, `--max-warnings`).
- Reuse existing `@gml-modules/parser`, `@gml-modules/semantic`, and `@gml-modules/refactor` capabilities for project-aware decisions.
- Minimize net-new custom infrastructure code by building on mature linting frameworks.

## Non-goals

- No compatibility shims that preserve old option names forever.
- No changes to parser golden `.gml` fixtures for migration.
- No expansion of formatter configurability beyond a focused formatting surface.

## Current State (Relevant)

- Plugin currently mixes formatting and semantics-changing transforms in one package (`src/plugin`).
- Project-aware safety already exists via runtime ports:
  - `setSemanticSafetyRuntime(...)`
  - `setRefactorRuntime(...)`
  - `setIdentifierCaseRuntime(...)`
- CLI composition root already wires semantic/refactor adapters (`src/cli/src/plugin-runtime/runtime-configuration.ts`).

This is a strong base for a split: the analysis engine exists, but is currently invoked by formatter options.

## Definitive Architecture Decision

The implementation is **Option A only**:

- Use **ESLint v9** as the lint engine.
- Implement a dedicated GML lint workspace as an ESLint language plugin + rules package.
- Keep `@gml-modules/plugin` formatter-only.

No custom lint engine and no Oxlint implementation are part of this plan.

## Phase 0 Completion (Done)

Phase 0 (decision + contracts) is complete in this document. The following decisions are now locked:

- [x] Package/workspace names:
  - Formatter: `src/plugin` / `@gml-modules/plugin`
  - Linter: `src/lint` / `@gml-modules/lint`
  - Composition root: `src/cli` / `@gml-modules/cli`
- [x] Ownership boundaries:
  - `@gml-modules/plugin` is formatter-only.
  - `@gml-modules/lint` owns lint diagnostics and fixes.
  - `@gml-modules/lint` does not depend on `@gml-modules/plugin`.
  - `@gml-modules/plugin` remains isolated from direct semantic/refactor dependencies.
- [x] Formatter option surface frozen (formatter-only):
  - Keep: Prettier core options + `allowSingleLineIfStatements` + `logicalOperatorsStyle`.
  - Migrate all semantics-changing options to lint rules (see migration matrix).
- [x] Rule naming conventions:
  - Namespaces: `gml/*` and `feather/*`.
  - Prefixes by intent:
    - correctness/safety: `no-*`, `require-*`
    - preference/optimization: `prefer-*`, `optimize-*`
- [x] Default severity policy:
  - correctness/safety rules default to `error` or `warn` based on fix confidence.
  - optimization/preference rules default to `warn`.
  - all rules support `off`/`warn`/`error` overrides.

This satisfies the original Phase 0 exit criteria:

- [x] architecture decision recorded
- [x] option migration table defined
- [x] naming + severity conventions defined

## Option A Implementation (Specifics)

## `@gml-modules/lint` workspace contents

Create a new top-level workspace: `src/lint` (`@gml-modules/lint`) with:

- `src/language/`
  - `parse-gml-for-eslint.ts`: parse `.gml` text via `@gml-modules/parser`.
  - `visitor-keys.ts`: visitor keys map for ESLint traversal.
  - `source-code.ts`: source/loc/range helpers and comment mapping.
- `src/rules/`
  - `gml/*.ts`: custom GML rules.
  - `feather/*.ts`: Feather-derived rules.
  - One file per rule; no mega-rule files.
- `src/configs/`
  - `recommended.ts`
  - `feather.ts`
  - `performance.ts`
- `src/services/`
  - run-scoped project analysis context (semantic/refactor integration).
  - rule-context helpers for project-aware checks.
- `src/index.ts`
  - namespace export surface for language + rules + configs.

## ESLint language integration contract

Implement language support so ESLint can lint `.gml` files directly:

- Parser bridge returns ESTree-compatible AST.
  - Reuse `Core.convertToESTree(...)` as the base conversion.
  - Guarantee `type`, `loc`, `range`, and comment arrays are present in ESLint-expected shape.
- Provide visitor keys for all traversable node types used by rules.
- Ensure parse errors are surfaced as lint diagnostics (not thrown uncaught).

Rule of implementation:

- `@gml-modules/lint` owns the ESLint-facing AST contract.
- `@gml-modules/parser` remains parser-only and is not coupled to ESLint internals.

## Rule API + severity model

All rules follow ESLint standard create/fixer APIs:

- Severity set via config (`off`/`warn`/`error`).
- Rule options are schema-validated per rule.
- Fixes emitted through ESLint fixers; no ad-hoc file writers from rule code.

Every rule must support:

- detect-only mode (without `--fix`)
- conservative autofix mode (`--fix`)
- project-aware skip behavior with explicit diagnostics when cross-file safety is not provable

## Project-aware services (shared per lint run)

Instantiate one run-scoped analysis context and share it across all files/rules:

- Build/load `Semantic.buildProjectIndex(...)` once.
- Build one `Refactor.RefactorEngine(...)` once.
- Expose services to rules via a typed context object:
  - `isIdentifierNameOccupiedInProject`
  - `listIdentifierOccurrenceFiles`
  - `planFeatherRenames`
  - `assessGlobalVarRewrite`
  - `resolveLoopHoistIdentifier`

This avoids repeated project indexing per file/rule and keeps performance predictable.

## CLI integration details (`src/cli`)

Add a dedicated `lint` command in `src/cli/src/commands/lint.ts`:

- `lint <path>`
- `--fix`
- `--max-warnings <n>`
- `--format <stylish|json|checkstyle>`
- `--quiet`
- `--config <path>`

Execution flow:

1. Resolve target path(s) and config.
2. Initialize run-scoped project services once.
3. Execute ESLint with GML language plugin + selected rules.
4. Apply fixes when `--fix` is enabled.
5. Emit report and exit codes using ESLint semantics.

Exit behavior:

- non-zero on any error-level findings
- non-zero when warnings exceed `--max-warnings`

## Config format (flat config)

Use ESLint flat config as the canonical config shape for lint:

```ts
// eslint.config.js (example)
import { Lint } from "@gml-modules/lint";

export default [
    {
        files: ["**/*.gml"],
        language: "gml/gml",
        plugins: {
            gml: Lint.plugin
        },
        rules: {
            "gml/no-globalvar": "error",
            "gml/prefer-loop-length-hoist": ["warn", { functionSuffixes: { array_length: "len" } }],
            "feather/no-trailing-macro-semicolon": "error"
        }
    }
];
```

## Fix safety contract

For project-aware rules:

- Apply fix only when analysis confirms local/project safety.
- If safety cannot be proven, report finding with reason and skip fix.
- Never perform hidden cross-file writes from a single-file lint fix.

For syntax-repair rules:

- Fixes remain local to the file.
- Conflicting fixes are left to ESLint conflict resolution.

## Target Package Topology

## Workspaces

- Keep `src/plugin` as formatter-only top-level workspace/package (`@gml-modules/plugin`).
  - Continue publishing as the Prettier plugin package.
  - Remove semantics-changing transforms/options from formatter path.
- Add `src/lint` as a new top-level workspace/package (suggested name: `@gml-modules/lint`).
  - Exposes GML language integration + lint rules + recommended configs.
- Keep `src/cli` as composition root.
  - Add `lint` command.
  - Continue wiring project-aware adapters (semantic/refactor) in one place.

Proposed top-level workspace layout:

```text
src/
  plugin/   # formatter-only workspace
  lint/     # linter/fixer-only workspace
  cli/      # composition root, format + lint commands
  core/
  parser/
  semantic/
  refactor/
  transpiler/
  runtime-wrapper/
```

## Rule Namespaces

- `feather/*`: rules derived from Feather diagnostics/fixes.
- `gml/*`: custom project rules and style/perf transforms currently in formatter options.

## Concrete Monorepo Changes (Option A)

Implement these repository changes explicitly:

1. Add `src/lint` to `pnpm-workspace.yaml` and root `package.json` workspaces.
2. Add new workspace files:
   - `src/lint/package.json`
   - `src/lint/tsconfig.json`
   - `src/lint/index.ts` (single named namespace export)
   - `src/lint/src/index.ts`
   - `src/lint/src/language/*`
   - `src/lint/src/rules/*`
   - `src/lint/src/configs/*`
   - `src/lint/src/services/*`
   - `src/lint/test/*`
3. Update `src/cli`:
   - add `src/cli/src/commands/lint.ts`
   - export/register lint command in `src/cli/src/commands/index.ts` and `src/cli/src/cli.ts`
   - add CLI tests for lint command flow.
4. Update `src/plugin`:
   - remove migrated option metadata from `src/plugin/src/components/default-plugin-components.ts`
   - remove migrated transform gating from `src/plugin/src/parsers/gml-parser-adapter.ts`
   - keep formatter-only options and printing behavior.
5. Update docs:
   - root `README.md` config tables
   - `src/plugin/README.md` to describe formatter-only scope
   - add lint usage/config examples.

Dependency boundaries for this plan:

- `@gml-modules/lint` depends on `@gml-modules/core`, `@gml-modules/parser`, `@gml-modules/semantic`, `@gml-modules/refactor`, and `eslint`.
- `@gml-modules/plugin` remains the only workspace depending on Prettier-related formatting packages.
- `@gml-modules/lint` does not depend on `@gml-modules/plugin`.

## Runtime Execution Model (Option A)

Single lint run flow:

1. CLI resolves paths/config and starts lint runtime.
2. Lint runtime builds one shared `ProjectLintContext`:
   - semantic project index
   - refactor engine instance
   - lookup/fix planning services
3. ESLint walks each `.gml` file using the GML language adapter.
4. Rules consume `ProjectLintContext` for project-aware decisions.
5. ESLint applies in-file fixes when `--fix` is enabled.
6. CLI reports diagnostics and exits per ESLint semantics.

`ProjectLintContext` is immutable for the run except internal caches.

## Option Migration Matrix

## Stay with formatter (`@gml-modules/plugin`)

These remain formatter concerns:

- Prettier core options: `printWidth`, `tabWidth`, `semi`, `useTabs`, `objectWrap`, etc.
- `allowSingleLineIfStatements`
  - Formatting layout preference.
- `logicalOperatorsStyle`
  - Printing-time representation preference (`keywords` vs `symbols`).

## Move to lint rules (`@gml-modules/lint`)

| Current plugin option | New rule (proposed) | Default level | `--fix` support | Notes |
| --- | --- | --- | --- | --- |
| `optimizeLoopLengthHoisting` | `gml/prefer-loop-length-hoist` | `warn` | yes (safe only) | Uses project-aware collision checks; includes current hoisting logic. |
| `loopLengthHoistFunctionSuffixes` | Rule option for `gml/prefer-loop-length-hoist` | n/a | n/a | Moves from formatter option to rule options. |
| `condenseStructAssignments` | `gml/prefer-struct-literal-assignments` | `warn` | yes | Converts property assignment chains to struct literals. |
| `optimizeLogicalExpressions` | `gml/optimize-logical-flow` | `warn` | yes (conservative) | Includes guard-condense and safe branch simplifications. |
| `preserveGlobalVarStatements` | `gml/no-globalvar` | `warn` | yes (project-aware gated) | Rewrites only when cross-file safety checks pass. |
| `applyFeatherFixes` | Split into `feather/*` rules | mixed | yes (per rule) | Replace one global switch with explicit diagnostics + severities. |
| `normalizeDocComments` | `gml/normalize-doc-comments` | `warn` | yes | Keep out of formatter if it edits semantic text content. |
| `useStringInterpolation` | `gml/prefer-string-interpolation` | `warn` | yes | Converts eligible concatenations to interpolation. |
| `optimizeMathExpressions` | `gml/optimize-math-expressions` | `warn` | yes | Move optimization transforms to lint autofixes. |
| `sanitizeMissingArgumentSeparators` | `gml/require-argument-separators` | `error` | yes | Syntax repair should be explicit lint/fix, not silent formatter mutation. |

## New custom rule requested

- `gml/prefer-hoistable-loop-accessors`
  - Detects repeated array/list/etc. length access in loops.
  - Can suggest/fix hoisting with project-aware name safety.
  - This captures the “array/list hoistability” requirement currently tied to loop hoisting behavior.

## Linter Config Model (ESLint-like)

Use standard severity model:

- `"off"`: rule disabled.
- `"warn"`: reported; non-blocking unless warning threshold exceeded.
- `"error"`: reported; contributes to non-zero exit.

Rule config shape:

```json
{
  "rules": {
    "gml/no-globalvar": "error",
    "gml/prefer-loop-length-hoist": ["warn", { "functionSuffixes": { "array_length": "len" } }],
    "feather/no-trailing-macro-semicolon": "error"
  }
}
```

## CLI behavior (`src/cli`)

Add `lint` command with ESLint-like behavior:

- `lint <path>`
- `--fix`
- `--max-warnings <n>`
- `--format <name>` (stylish/json/checkstyle)
- `--quiet`
- `--config <path>`

Exit code semantics:

- Non-zero when any `error` diagnostics exist.
- Non-zero when warnings exceed `--max-warnings`.

## `--fix` behavior

- Only apply fixes exposed by active rules.
- Keep fixers conservative:
  - If project-aware checks fail, emit diagnostic without fix.
  - If fix conflicts occur, rely on engine conflict resolution.
- Keep formatter command and lint `--fix` command distinct:
  - `format` = layout output.
  - `lint --fix` = semantics-aware code corrections/refactors.

## Project-aware analysis design

Create one run-scoped analysis context per lint invocation:

- Build or load project index once (semantic).
- Construct one refactor engine once (refactor + parser bridge + transpiler bridge).
- Share this context across all rules that need cross-file occupancy or rename planning.

This avoids repeated project scans per rule/file and reuses the current CLI runtime wiring model.

## Implementation Phases

## Phase 1: New lint workspace scaffold

- Add `src/lint` workspace (`package.json`, `tsconfig.json`, top-level `index.ts`, `src/`, `test/`).
- Add exports for:
  - language adapter
  - rules
  - recommended configs
- Keep workspace API namespaced (`Lint` namespace export pattern).

Exit criteria:
- Workspace builds and tests with placeholder rule.

## Phase 2: ESLint language integration

- Implement GML language adapter using existing parser.
- Provide AST traversal metadata (`visitorKeys`) and source mapping.
- Add baseline lint smoke tests on `.gml` inputs.

Exit criteria:
- ESLint engine can lint `.gml` files with one simple rule.

## Phase 3: Port project-aware runtime layer to lint context

- Extract/reuse adapter logic from CLI runtime configuration.
- Provide rule context services for:
  - identifier occupancy checks
  - occurrence files
  - planned renames
  - globalvar rewrite assessment

Exit criteria:
- One project-aware rule can query cross-file data in tests.

## Phase 4: Rule migration from formatter options

- Port each moved option into dedicated lint rules (table above).
- Split `applyFeatherFixes` into granular `feather/*` rules.
- Add per-rule tests:
  - detect only
  - `--fix`
  - project-aware skip/report

Exit criteria:
- All moved options represented as rules with coverage.

## Phase 5: Formatter cleanup

- Remove moved options from formatter option metadata and parser transform gating.
- Keep formatter-only behavior deterministic and non-semantic.
- Update plugin docs/examples accordingly.

Exit criteria:
- Formatter no longer performs project-aware or semantics-changing rewrites.

## Phase 6: CLI integration

- Add `lint` command in `src/cli/src/commands/`.
- Wire config loading and rule selection.
- Implement `--fix`, `--max-warnings`, and output formatters.
- Keep `format` command behavior unchanged except removed migrated options.

Exit criteria:
- End-to-end `lint` and `lint --fix` workflows pass integration tests.

## Phase 7: Migration and release

- Publish migration guide:
  - old formatter options -> new lint rules.
  - example config files.
  - CI examples (`format --check` + `lint`).
- Mark migrated formatter options as removed/breaking in release notes.

Exit criteria:
- Documentation complete and release-ready.

## Testing Strategy

- Unit tests (linter workspace):
  - rule detection/fix per rule.
  - severity behavior (`off`, `warn`, `error`).
- Integration tests (CLI):
  - `lint`, `lint --fix`, exit codes, warning thresholds.
  - project-aware cases using temp multi-file projects.
- Regression tests:
  - formatter output unchanged for formatting-only scenarios.
  - ensure formatter no longer applies moved semantic transforms.

## Risks and Mitigations

- Risk: behavior drift after moving transforms out of formatter.
  - Mitigation: snapshot before/after on representative corpora; explicit migration docs.
- Risk: custom-language ESLint integration complexity.
  - Mitigation: start with minimal rule and stabilize adapter before porting many rules.
- Risk: performance regression from project-aware checks.
  - Mitigation: run-scoped analysis cache; lazy initialize project index only when a rule needs it.
- Risk: one large `applyFeatherFixes` split.
  - Mitigation: split incrementally by diagnostic family; preserve tests during extraction.

## Suggested Initial Rule Presets

- `lint:recommended`
  - Mostly correctness/safety (`error` or `warn`).
- `lint:feather`
  - Feather-derived rules only.
- `lint:performance`
  - Hoisting/math/logical optimization style rules (mostly `warn`).

## Rollout Order Recommendation

1. Ship linter package + CLI command with a minimal stable rule set.
2. Move project-aware rules first (`gml/no-globalvar`, feather rename safety, loop hoist safety).
3. Move optional optimization transforms next.
4. Remove migrated formatter options in one documented breaking release.

## External References

- ESLint custom languages and plugin model:
  - [https://eslint.org/docs/latest/extend/languages](https://eslint.org/docs/latest/extend/languages)
  - [https://eslint.org/docs/latest/extend/plugins](https://eslint.org/docs/latest/extend/plugins)
- ESLint Node API and fix flow:
  - [https://eslint.org/docs/latest/integrate/nodejs-api](https://eslint.org/docs/latest/integrate/nodejs-api)
- ESLint custom rules and fixer API:
  - [https://eslint.org/docs/latest/extend/custom-rules](https://eslint.org/docs/latest/extend/custom-rules)
