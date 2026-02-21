# Formatter/Linter Split Implementation Notes

## Snapshot (2026-02-17)

- Formatter/linter split migration is largely complete on runtime behavior:
  - formatter is strict/layout-first and does not expose legacy semantic/refactor adapter hooks;
  - lint owns migrated semantic/content rewrite responsibilities.
- Full pinned-plan completion still has remaining architecture/doc alignment work (see current audit findings below).
- `plugin`, `lint`, and `cli` workspace suites remain largely stable; lint currently has known project-context registry failures outside the formatter/linter split migration scope.
- Legacy formatter-lint adapter integration paths were removed from active runtime wiring and tests.

## Current Audit Findings (2026-02-15)

### Aligned with pinned linter contracts

1. Lint workspace public-surface contracts are implemented and passing:
   - `Lint.plugin` language-plugin surface, `Lint.configs` overlays, and `Lint.ruleIds` map contracts are covered by lint contract tests.
2. ESLint v9 language-object behavior is enforced by min/latest ESLint contract tests.
3. Overlay guardrail behavior (`GML_OVERLAY_WITHOUT_LANGUAGE_WIRING`) is implemented and covered with normalization/dedupe/path-sample tests.
4. Project-context registry behavior (root resolution, hard excludes, `--index-allow`, forced-root boundaries, deterministic caching) is covered by dedicated lint tests.
5. Missing-context emission policy (once per file per rule) and unsafe-fix reason-code declaration/validation are covered by rule contract tests.
6. Rule implementation coverage now enforces non-placeholder behavior:
   - `gml` and `feather` rule factories fail fast on missing implementation instead of returning silent no-op rules.
   - rule-contract coverage includes a guard that every registered rule returns a non-empty listener object.

### Misaligned / remaining gaps against full split plan

1. Shared provider end-state is not complete yet:
   - Lint now supports semantic-backed snapshots from semantic project-index payloads (`createProjectAnalysisSnapshotFromProjectIndex`), and CLI `lint` now prebuilds semantic indices per invocation root and injects snapshots via `createPrebuiltProjectAnalysisProvider`.
   - A text provider still exists as an internal fallback surface, and lint/refactor are still not wired to one identical shared provider module.
2. Shared-provider parity tests (same snapshot => same answers across lint/refactor consumers) are not present yet.
3. Workspace-separation cleanup is functionally enforced at runtime but still disorganized in source layout:
   - formatter transform registry still contains/exports legacy migrated transform modules that are no longer active in the default parser-prep pipeline, which increases migration ambiguity and maintenance overhead.

### Remaining work to reach strict full-plan completion

1. Implement a semantic-backed `ProjectAnalysisProvider` shared by lint and refactor, including resolution of the lint sync context API versus semantic async index build boundary.
2. Add shared-provider parity contract tests that validate identical answers for occupancy/occurrence/rename-planning/loop-hoist/globalvar safety across lint and refactor consumers.
3. Finish docs migration cleanup in remaining package docs (if any references to removed formatter-era semantic options or legacy adapter ownership persist).
4. Remove or isolate dormant migrated semantic transform modules from formatter workspace exports to make boundary ownership explicit in source, not only in runtime wiring.
5. Continue tightening fixer fidelity where conservative text rewrites remain, but keep ownership in lint and avoid fixture-symbol hardcoding.

## Completed Since Prior Snapshot

- Lint rules are wired through real `gml/*` implementations (instead of no-op scaffolding), with schema/capability alignment updates in rule catalog and helpers.
- Lint rule factory wiring no longer silently falls back to placeholder/no-op modules:
  - `createGmlRule(...)` now throws on unmapped `gml/*` definitions.
  - `createFeatherRule(...)` now throws on unmapped Feather IDs.
  - deprecated `src/lint/src/rules/noop.ts` scaffold was removed.
- Feather fixer genericity hardening landed for previously fixture-bound rules:
  - `gm1012`, `gm1032`, `gm1034`, `gm1036`, `gm1056`, `gm1059`, `gm1062`, and `gm2044` now use generic pattern transforms instead of fixture-specific symbol replacements.
  - legacy one-off fixture symbol rewrites were removed from `gm2004`, `gm2012`, and `gm2043`.
- Rule contracts now enforce no silent placeholders:
  - `src/lint/test/rule-contracts.test.ts` includes a guard that each registered lint rule returns at least one listener.
- Project context registry now builds an index-backed context (identifier occupancy and occurrence helpers, rename planning hooks, and globalvar rewrite assessment hooks).
- Project context indexing now normalizes identifier matching by canonical lowercase keys for occupancy/occurrence/planning parity across files.
- CLI lint guardrail behavior/messaging was tightened (overlay warning policy and fallback messaging improvements).
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
- Plugin runtime adapter module was removed entirely (`src/plugin/src/runtime`), and remaining dormant transform helpers were decoupled from formatter runtime adapter APIs.
- Core synthetic doc helper fallback no longer keys behavior off legacy formatter migration options.
- Plugin formatter test fixtures no longer pass removed migrated options (`applyFeatherFixes`, `optimize*`, `condenseStructAssignments`, `loopLengthHoist*`, etc.); option JSON inputs now contain only current formatter-surface fields.
- Root integration plugin fixture option files under `test/fixtures/integration/*.options.json` were also scrubbed of removed migrated formatter keys.
- Migrated-transform regression tests now validate current formatter behavior without supplying removed/deprecated formatter options.
- Lint project context registry now consumes a dedicated project-analysis provider contract (`src/lint/src/services/project-analysis-provider.ts`) instead of embedding analysis logic directly in registry orchestration.
- Lint registry/provider delegation now has explicit coverage ensuring provider-backed snapshot construction is used and cached per resolved root.
- Plugin README ownership docs were aligned with current runtime surface (identifier-case integration only; no semantic/refactor runtime hook exports).
- Root generated-doc contract now enforces checked-in sync for `docs/generated/project-aware-rules.md` against `Lint.docs.renderProjectAwareRulesMarkdown()`.
- Lint fixture and contract tests now resolve source/fixture paths correctly under both workspace-local runs and monorepo-root compiled runs (no brittle `cwd` assumptions).
- Recovery metadata ownership contract checks now recurse the full lint rule source tree and validate against source `.ts` roots (avoids vacuous/`dist`-path false passes).
- Repository-wide explicit test skips were removed (`{ skip: ... }` and `.skip(...)` declarations now absent under `src/` and `test/` sources).
- Runtime-wrapper patch-queue contract test was made deterministic by forcing explicit queue flush before assertions (avoids timer-flush race).
- Hot-reload integration tests were hardened with startup-readiness/status waits and less aggressive WebSocket/status timeout defaults to avoid startup-race flakes under full-suite load.
- Refactor validation tests now use synchronous throw assertions where validation throws before promise construction.
- CLI lint config discovery now defers selected-user-config resolution to ESLint native behavior when a discovered config exists (no CLI first-match override), while preserving bundled fallback behavior when discovery finds none.
- CLI lint guardrail tests now include explicit coverage that discovered config mode does not force `overrideConfigFile` and that no-config mode still injects bundled fallback config.
- Root and CLI README migration docs were updated to remove formatter-era semantic option documentation and legacy semantic/refactor adapter ownership language.
- Refactor overlap helper logic was extracted from `RefactorEngine` to a dedicated provider contract/module (`src/refactor/src/project-analysis-provider.ts`), and the engine now consumes that provider via dependency injection/default provider wiring.
- Refactor provider delegation coverage was added (`src/refactor/test/project-analysis-provider.test.ts`) to enforce that engine overlap methods delegate through provider surface rather than embedding logic in the engine class.
- Lint project analysis provider contract now carries explicit build options (`excludedDirectories`, `allowedDirectories`) to align provider behavior with hard-exclude and `--index-allow` policies.
- Lint provider layer now exposes semantic snapshot builders and prebuilt provider injection (`buildSemanticProjectAnalysisSnapshot`, `createPrebuiltProjectAnalysisProvider`) for invocation-scoped deterministic indexing.
- CLI lint command now prebuilds semantic snapshots for resolved invocation roots and injects a prebuilt provider into project-context registry wiring.
- `--index-allow` indexing behavior now includes allowed descendants under otherwise hard-excluded directories during snapshot construction (covered by updated registry test assertions).
- Loop-hoist rule ownership is now aligned with the pinned split contract:
  - `gml/prefer-loop-length-hoist` now owns local hoist autofixes (fixture-backed with `fixed.gml` expectations).
  - `gml/prefer-hoistable-loop-accessors` remains detect/suggest-only with no fixer application.
  - `functionSuffixes: { array_length: null }` is now covered as a contract test that disables hoist generation for that accessor.
- Formatter runtime no longer applies parser-stage semantic rewrites for:
  - trailing optional default synthesis (`preprocessFunctionArgumentDefaultsTransform`);
  - data-structure accessor mutation (`normalizeDataStructureAccessorsTransform`).
- Lint now owns migrated coverage and fixers for these behaviors:
  - `gml/normalize-data-structure-accessors`;
  - `gml/require-trailing-optional-defaults`.
- Plugin semantic rewrite tests for these behaviors were removed from formatter workspace and replaced by formatter regression assertions that formatting does **not** perform these rewrites.
- Doc-comment semantic rewrite ownership moved further into lint:
  - `gml/normalize-doc-comments` now covers legacy doc-prefix normalization (`// @tag`, `// / text`), empty `@description` removal, doc-block description promotion, and synthetic function-doc tag synthesis (`@description`, missing `@param`, missing `@returns`).
  - New lint tests in `src/lint/test/normalize-doc-comments-rule.test.ts` now validate migrated doc-comment behaviors that were previously plugin-owned.
  - Plugin semantic tests for comment-promotion/description cleanup were removed from `src/plugin/test` as lint-owned behavior, including migration of `synthetic-doc-comment-builder.test.ts` and `transforms/doc-comment/description-utils.test.ts` coverage into lint.
  - Plugin printer synthetic-doc runtime emission is now disabled (`src/plugin/src/printer/doc-comment/synthetic-doc-comment-builder.ts` returns `null` payloads), with regression coverage moved to lint + formatter boundary tests.
  - Plugin comment suppression no longer relies on synthetic doc placeholders for function assignments, preventing formatter-side doc-tag synthesis paths from reappearing.
- Additional feather parity fixture migration landed in lint:
  - Added rule implementations + lint-owned fixtures for the previously unimplemented parity IDs: `feather/gm1012`, `feather/gm1021`, `feather/gm1054`, `feather/gm1100`, `feather/gm2023`, `feather/gm2025`, `feather/gm2040`, `feather/gm2064`.
  - Added lint fixture directories for these IDs under `src/lint/test/fixtures/feather/gm####/` (including migrated copies for `gm1012`/`gm1100` from integration inventory fixtures).
  - Expanded fixture-backed lint tests to cover these IDs in both migration harness and exact fixture-output checks.
  - Added rule implementations and migration-harness coverage for `feather/gm1013`, `feather/gm1032`, `feather/gm1034`, `feather/gm1036`, `feather/gm1056`, `feather/gm1059`, `feather/gm1062`, and migrated `GM20xx` fixture IDs through `gm2061`.
  - `src/lint/test/feather-plugin-fixture-migration.test.ts` now covers these migrated fixtures under the lint-owned `src/lint/test/fixtures/feather/*` corpus.
  - `src/lint/test/feather-rule-fixtures.test.ts` continues to enforce exact `fixed.gml` parity for the pinned migrated-feather baseline (`gm1003`, `gm1004`, `gm1005`, `gm1014`, `gm1016`, `gm1023`).
- `gml/normalize-doc-comments` coverage was expanded to include legacy `// @tag` normalization into canonical `/// @tag` form.
- Previously missing split-migration `gml/*` ownership rules are now implemented in lint and fixture-backed:
  - `gml/normalize-directives`
  - `gml/require-control-flow-braces`
  - `gml/no-assignment-in-condition`
  - `gml/normalize-operator-aliases`
- Lint rule catalog/config/test wiring now includes these rules (metadata contracts, recommended preset entries, and `rule-fixtures` coverage).
- These rules now apply generic migration rewrites (legacy `#define` directive canonicalization, no-parens/inline `if` brace synthesis, conditional assignment normalization, and logical operator alias canonicalization) rather than fixture-specific replacements.

## Test Migration Status

- `src/plugin`:
  - `pnpm --filter @gml-modules/plugin test` passes.
  - Result: `pass 149`, `fail 0`, `skipped 0`.
- `src/lint`:
  - `pnpm --filter @gml-modules/lint test` currently reports known non-split failures in `project-context-registry.test.ts` and is not fully green.
  - Result: `pass 54`, `fail 3`, `skipped 0`.
- `src/cli`:
  - `pnpm --filter @gml-modules/cli test` passes.
  - Result: `pass 540`, `fail 0`, `skipped 0`.
- `test` root contracts:
  - `pnpm run test:root` passes.
  - Includes generated project-aware docs sync assertion and plugin integration fixture assertions.
  - Includes a new guard that fails if integration option fixtures reintroduce removed formatter migration keys.
- Full monorepo suite:
  - `pnpm test` passes.
  - Result: `pass 2997`, `fail 0`, `skipped 0`.
- Skipped-test audit:
  - Search: `rg -n "\\{\\s*skip\\s*:|\\.skip\\(" src test --glob '!**/dist/**'`
  - Result: no matches.
- CLI skip-path cleanup remains in place:
  - Symlink traversal test no longer uses `t.skip()` when symlink creation is unavailable; it asserts deterministic behavior for both capability paths.

## Formatter-Only Ownership Ledger (2026-02-15, Exhaustive)

### Scope and accounting

- Audited plugin test files: `90`.
- Audited formatter fixture basenames under `src/plugin/test/fixtures/formatting`: `91` basenames (`262` files total).
- This ledger is exhaustive: every plugin formatter test file and every formatter fixture basename is assigned to exactly one target-state owner (`plugin`, `lint`, or `split`).
- This section supersedes older snapshot notes that implied formatter semantic fixture cleanup was already complete.

### Formatter functionality migration map (target state)

| Current formatter-side behavior | Current implementation location | Target owner | Target location / rule |
| --- | --- | --- | --- |
| `#define`/legacy region normalization and macro canonicalization | `src/plugin/src/printer/print.ts`, formatter fixtures (`define-normalization`, `testIfBraces`, `testGM1030`, `testGM1038`, `testGM1051`) | `lint` | New `gml/normalize-directives` rule family + feather-specific rule fixtures |
| Missing argument separator preservation/synthesis during printing | `src/plugin/src/parsers/gml-parser-adapter.ts` (`markCallsMissingArgumentSeparatorsTransform`), `src/plugin/src/printer/print.ts` (`synthesizeMissingCallArgumentSeparators`) | `lint` | `gml/require-argument-separators` |
| Optional parameter default synthesis (`= undefined`) | `src/plugin/src/parsers/gml-parser-adapter.ts` (`preprocessFunctionArgumentDefaultsTransform`), `src/plugin/src/printer/print.ts` | `lint` | New `gml/require-trailing-optional-defaults` |
| Data-structure accessor rewrites (`[?`, `[|`, `[#`) | `src/plugin/src/parsers/gml-parser-adapter.ts` (`normalizeDataStructureAccessorsTransform`) | `lint` | New `gml/normalize-data-structure-accessors` |
| Conditional assignment sanitizer (`if (a = b)` rewrites) | `src/plugin/src/transforms/conditional-assignment-sanitizer.ts`, `testIfBraces` expectations | `lint` | New `gml/no-assignment-in-condition` (or equivalent) |
| Guard/if structural rewrites (brace insertion, single-line guard restructuring) | `src/plugin/src/printer/print.ts` (`printSingleClauseStatement`, `allowSingleLineIfStatements`) | `lint` | New `gml/require-control-flow-braces` |
| Doc-comment content rewriting/promotion/synthesis (`@description`, `@returns`, tag cleanup) | `src/plugin/src/printer/normalize-formatted-output.ts`, `src/plugin/src/printer/doc-comment/*`, `src/plugin/src/transforms/doc-comment/*`, `Core.formatLineComment` behavior consumed by plugin | `lint` | `gml/normalize-doc-comments` (expanded scope) + feather doc-comment rule coverage |
| Comment banner/content normalization (drop boilerplate, collapse decorated banners) | `src/plugin/src/comments/*`, `Core.formatLineComment`, `normalizeFormattedOutput` | `lint` | `gml/normalize-doc-comments` (expanded scope) |
| String/math/logical semantic rewrites | `src/plugin/src/printer/print.ts` (`simplifyBooleanBinaryExpression`, trig conversion, operator alias rewrites), `src/plugin/src/transforms/math/*`, `src/plugin/src/transforms/logical-expressions/*`, `src/plugin/src/transforms/convert-string-concatenations.ts` | `lint` | `gml/prefer-string-interpolation`, `gml/optimize-math-expressions`, `gml/optimize-logical-flow`, plus new `gml/normalize-operator-aliases` where needed |
| Struct assignment consolidation and loop-hoist rewrites | `src/plugin/src/transforms/consolidate-struct-assignments.ts`, `src/plugin/src/transforms/loop-size-hoisting/*` fixtures | `lint` | `gml/prefer-struct-literal-assignments`, `gml/prefer-loop-length-hoist` |
| Pure layout rendering (indentation, wrapping, spacing, semicolon layout, print-width wrapping, logical operator style rendering only) | Plugin printer/layout policy | `plugin` | Remains in `src/plugin` tests/fixtures |

### Plugin test ownership ledger (90/90)

#### Stay in plugin (formatter-only) — 61 files

- `src/plugin/test/argument-count-fallback-spacing.test.ts`
- `src/plugin/test/block-initial-static-spacing.test.ts`
- `src/plugin/test/block-trailing-blank-lines.test.ts`
- `src/plugin/test/call-argument-layout.test.ts`
- `src/plugin/test/call-expression-inline-new-with-callback.test.ts`
- `src/plugin/test/call-expression-inline-variant.test.ts`
- `src/plugin/test/call-expression-member-line-break.test.ts`
- `src/plugin/test/call-expression-single-argument-break.test.ts`
- `src/plugin/test/clause-trailing-comment-regression.test.ts`
- `src/plugin/test/comment-attachment.test.ts`
- `src/plugin/test/constructor-blank-lines.test.ts`
- `src/plugin/test/constructor-instance-methods.test.ts`
- `src/plugin/test/constructor-nested-function-spacing.test.ts`
- `src/plugin/test/constructor-parent-clause-inline.test.ts`
- `src/plugin/test/core-option-overrides-resolver.test.ts`
- `src/plugin/test/default-plugin-component-dependencies.test.ts`
- `src/plugin/test/delete-statement-semi.test.ts`
- `src/plugin/test/empty-block-comments.test.ts`
- `src/plugin/test/enum-trailing-comment-spacing.test.ts`
- `src/plugin/test/feather-metadata-resources.test.ts`
- `src/plugin/test/fix-missing-decimal-zeroes-option.test.ts`
- `src/plugin/test/for-update-spacing.test.ts`
- `src/plugin/test/formatter-migrated-transform-regression.test.ts`
- `src/plugin/test/function-assignment-semi.test.ts`
- `src/plugin/test/function-declaration-missing-params.test.ts`
- `src/plugin/test/function-declaration-trailing-blank-line.test.ts`
- `src/plugin/test/function-parameters-inline.test.ts`
- `src/plugin/test/gml-entry-point.test.ts`
- `src/plugin/test/gml-parser-adapter.test.ts`
- `src/plugin/test/identifier-case-environment.test.ts`
- `src/plugin/test/implicit-argument-alias-retention.test.ts`
- `src/plugin/test/logical-operators-parens.test.ts`
- `src/plugin/test/logical-operators-style-options.test.ts`
- `src/plugin/test/max-params-per-line-limit.test.ts`
- `src/plugin/test/multiline-block-comment-formatting.test.ts`
- `src/plugin/test/nested-function-doc-spacing.test.ts`
- `src/plugin/test/nested-function-spacing.test.ts`
- `src/plugin/test/no-debug-logging.test.ts`
- `src/plugin/test/object-wrap-option-resolver.test.ts`
- `src/plugin/test/object-wrap-option.test.ts`
- `src/plugin/test/path-safety.test.ts`
- `src/plugin/test/plugin-component-dependencies.test.ts`
- `src/plugin/test/plugin-component-implementations.test.ts`
- `src/plugin/test/plugin-components.test.ts`
- `src/plugin/test/prettier-doc-builders.test.ts`
- `src/plugin/test/printer-lvalue-chain.test.ts`
- `src/plugin/test/printer-regression.test.ts`
- `src/plugin/test/real-call-utils.test.ts`
- `src/plugin/test/reserved-identifiers.test.ts`
- `src/plugin/test/semantic-safety-runtime.test.ts`
- `src/plugin/test/semicolons.test.ts`
- `src/plugin/test/source-text.test.ts`
- `src/plugin/test/standalone-semicolons.test.ts`
- `src/plugin/test/statement-spacing-policy.test.ts`
- `src/plugin/test/static-function-semi.test.ts`
- `src/plugin/test/struct-argument-formatting.test.ts`
- `src/plugin/test/struct-call-arguments.test.ts`
- `src/plugin/test/struct-property-layout.test.ts`
- `src/plugin/test/switch-comment-formatting.test.ts`
- `src/plugin/test/ternary-parentheses.test.ts`
- `src/plugin/test/variable-block-spacing.test.ts`

#### Move from plugin to lint (semantic/content rewrite coverage) — 28 files

- `src/plugin/test/allow-single-line-if-default.test.ts` -> `src/lint/test/rules/gml/require-control-flow-braces.test.ts`
- `src/plugin/test/annotate-static-overrides.test.ts` -> `src/lint/test/rules/feather/static-overrides.test.ts`
- `src/plugin/test/comment-promotion.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/conditional-assignment-sanitizer.test.ts` -> `src/lint/test/rules/gml/no-assignment-in-condition.test.ts`
- `src/plugin/test/consolidate-struct-assignments.test.ts` -> `src/lint/test/rules/gml/prefer-struct-literal-assignments.test.ts`
- `src/plugin/test/convert-undefined-guard-assignments.test.ts` -> `src/lint/test/rules/gml/optimize-logical-flow.test.ts`
- `src/plugin/test/define-normalization-spacing.test.ts` -> `src/lint/test/rules/gml/normalize-directives.test.ts`
- `src/plugin/test/define-region-newlines.test.ts` -> `src/lint/test/rules/gml/normalize-directives.test.ts`
- `src/plugin/test/description-comment.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/doc-comment-description-promotion.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/doc-comment-empty-description.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/doc-comment-optional-array.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/doc-comment-struct-functions.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/line-comment-banner-length-option.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/line-comment-boilerplate-option.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/line-comment-formatting.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/line-comment-options-normalization.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/math-insert-node-before-loop-safety.test.ts` -> `src/lint/test/rules/gml/optimize-math-expressions.test.ts`
- `src/plugin/test/normalize-data-structure-accessors.test.ts` -> `src/lint/test/rules/gml/normalize-data-structure-accessors.test.ts`
- `src/plugin/test/optional-parameter-defaults.test.ts` -> `src/lint/test/rules/gml/require-trailing-optional-defaults.test.ts`
- `src/plugin/test/synthetic-doc-comment-builder.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/transforms/doc-comment/description-utils.test.ts` -> `src/lint/test/rules/gml/normalize-doc-comments.test.ts`
- `src/plugin/test/transforms/math/parentheses-cleanup.test.ts` -> `src/lint/test/rules/gml/optimize-math-expressions.test.ts`
- `src/plugin/test/transforms/math/scalar-condensing.test.ts` -> `src/lint/test/rules/gml/optimize-math-expressions.test.ts`
- `src/plugin/test/transforms/math/traversal-normalization.test.ts` -> `src/lint/test/rules/gml/optimize-math-expressions.test.ts`
- `src/plugin/test/transforms/preprocess-function-argument-defaults.test.ts` -> `src/lint/test/rules/gml/require-trailing-optional-defaults.test.ts`
- `src/plugin/test/transforms/registry.test.ts` -> `src/lint/test/rule-contracts.test.ts` (replace transform-registry checks with lint-rule-catalog checks)
- `src/plugin/test/transforms/trailing-macro-semicolon.test.ts` -> `src/lint/test/rules/feather/trailing-macro-semicolon.test.ts`

#### Split in place — 1 file

- `src/plugin/test/formatter-fixtures.test.ts` -> split into:
  - formatter-only fixture harness in `src/plugin/test/formatter-fixtures.test.ts` (updated to formatter-owned basenames only)
  - lint rule fixture harness coverage in `src/lint/test/rule-fixtures.test.ts` plus rule-specific lint tests

### Formatter fixture ownership ledger (91/91 basenames)

#### Keep in plugin (formatter-only corpus) — 7 basenames

- `testDrawEvent`
- `testHoistDisabled`
- `testIgnore`
- `testParams`
- `testPreserve`
- `testPreserveDescription`
- `testPrintWidth`

Target-state location: keep under `src/plugin/test/fixtures/formatting` as formatter/idempotence fixtures only.  
Note: single-file fixtures (`*.gml`) should be converted to explicit paired fixtures (`.input.gml` + `.output.gml`) with identical text to assert formatter non-mutation.

#### Move to lint (feather parity corpus) — 66 basenames

All GM basenames below move from plugin fixture ownership to lint fixture ownership.  
Target-state location pattern: `src/lint/test/fixtures/feather/gm####/input.gml` and `fixed.gml`, with `options.json` retained only as migration inventory metadata where present.

- `testGM1000`
- `testGM1002`
- `testGM1003`
- `testGM1004`
- `testGM1005`
- `testGM1007`
- `testGM1008`
- `testGM1009`
- `testGM1010`
- `testGM1013`
- `testGM1014`
- `testGM1015`
- `testGM1016`
- `testGM1017`
- `testGM1023`
- `testGM1024`
- `testGM1026`
- `testGM1028`
- `testGM1029`
- `testGM1030`
- `testGM1032`
- `testGM1033`
- `testGM1034`
- `testGM1036`
- `testGM1038`
- `testGM1041`
- `testGM1051`
- `testGM1052`
- `testGM1056`
- `testGM1058`
- `testGM1059`
- `testGM1062`
- `testGM1063`
- `testGM1064`
- `testGM2000`
- `testGM2003`
- `testGM2004`
- `testGM2005`
- `testGM2007`
- `testGM2008`
- `testGM2009`
- `testGM2011`
- `testGM2012`
- `testGM2015`
- `testGM2020`
- `testGM2026`
- `testGM2028`
- `testGM2029`
- `testGM2029Attachment`
- `testGM2030`
- `testGM2031`
- `testGM2032`
- `testGM2033`
- `testGM2035`
- `testGM2042`
- `testGM2043`
- `testGM2044`
- `testGM2046`
- `testGM2048`
- `testGM2050`
- `testGM2051`
- `testGM2052`
- `testGM2053`
- `testGM2054`
- `testGM2056`
- `testGM2061`

#### Split mixed formatter+linter fixtures — 18 basenames

Each basename below currently interweaves layout expectations with semantic/content rewrites and must be split into:
1) lint-owned rewrite fixture(s), and
2) formatter-owned layout fixture(s) that assert no semantic mutation.

| Legacy basename | Lint destination | Formatter destination |
| --- | --- | --- |
| `define-normalization` | `src/lint/test/fixtures/normalize-directives/define-normalization.*` | `src/plugin/test/fixtures/formatting/region-layout.*` |
| `testAligned` | `src/lint/test/fixtures/normalize-doc-comments/aligned-comments.*` | `src/plugin/test/fixtures/formatting/aligned-layout.*` |
| `testArgumentDocs` | `src/lint/test/fixtures/normalize-doc-comments/argument-docs.*` | `src/plugin/test/fixtures/formatting/call-argument-layout-complex.*` |
| `testBanner` | `src/lint/test/fixtures/normalize-doc-comments/banner-normalization.*` | `src/plugin/test/fixtures/formatting/banner-layout-preserved.*` |
| `testEmptyParamsComment` | `src/lint/test/fixtures/normalize-doc-comments/empty-params-comment.*` | `src/plugin/test/fixtures/formatting/function-empty-params-layout.*` |
| `testFlow` | `src/lint/test/fixtures/gml-flow-migration/*` (decompose into rule-specific fixtures) | `src/plugin/test/fixtures/formatting/control-flow-layout.*` |
| `testFunctionDescription` | `src/lint/test/fixtures/normalize-doc-comments/function-description.*` | `src/plugin/test/fixtures/formatting/function-doc-layout.*` |
| `testHoist` | `src/lint/test/fixtures/prefer-loop-length-hoist/legacy-hoist.*` | `src/plugin/test/fixtures/formatting/loop-layout.*` |
| `testIfBraces` | `src/lint/test/fixtures/require-control-flow-braces/if-braces.*` and `src/lint/test/fixtures/no-assignment-in-condition/if-assignment.*` | `src/plugin/test/fixtures/formatting/if-layout-preserved.*` |
| `testLogical` | `src/lint/test/fixtures/optimize-logical-flow/logical.*` | `src/plugin/test/fixtures/formatting/logical-wrap-layout.*` |
| `testManualMath` | `src/lint/test/fixtures/optimize-math-expressions/manual-math.*` | `src/plugin/test/fixtures/formatting/math-layout-manual.*` |
| `testMath` | `src/lint/test/fixtures/optimize-math-expressions/math.*` | `src/plugin/test/fixtures/formatting/math-layout.*` |
| `testOperators` | `src/lint/test/fixtures/normalize-operator-aliases/operators.*` | `src/plugin/test/fixtures/formatting/operators-wrap-layout.*` |
| `testOptimizeMathExpression` | `src/lint/test/fixtures/optimize-math-expressions/optimize.*` | `src/plugin/test/fixtures/formatting/optimize-math-layout.*` |
| `testSingleLineIf` | `src/lint/test/fixtures/require-control-flow-braces/single-line-if.*` | `src/plugin/test/fixtures/formatting/single-line-if-layout.*` |
| `testStrings` | `src/lint/test/fixtures/prefer-string-interpolation/strings.*` | `src/plugin/test/fixtures/formatting/string-wrap-layout.*` |
| `testStructs` | `src/lint/test/fixtures/prefer-struct-literal-assignments/structs.*` | `src/plugin/test/fixtures/formatting/struct-layout.*` |
| `testStructsLoose` | `src/lint/test/fixtures/prefer-struct-literal-assignments/structs-loose.*` | `src/plugin/test/fixtures/formatting/struct-layout-loose.*` |

### Options fixture handling

- For lint-owned or split lint portions, existing `*.options.json` files moved to `src/lint/test/fixtures/feather/gm####` directories are not formatter fixtures; rule options should be modeled in lint test cases and lint fixture metadata.
- Formatter fixture options remain only for layout options (`printWidth`, `logicalOperatorsStyle`, and other rendering-only knobs).
- No plugin formatter fixture may encode semantic rewrite toggles in the target state.

## Remaining Follow-ups (Non-blocking)

1. Keep direct ESLint docs and generated project-aware rule inventory in sync as lint rule internals evolve.
