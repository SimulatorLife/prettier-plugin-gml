# Formatter/Linter Split Plan

## Summary
1. Split responsibilities into a formatter-only workspace and an ESLint v9 language+rules workspace.
2. Lock exact ESLint language wiring, AST/token/comment/range contracts, parse-error behavior, project-context lifecycle, rule schemas, CLI semantics, and migration scope.
3. Keep formatter deterministic and non-semantic; move all non-layout rewrites to lint rules with explicit diagnostics and optional `--fix`.

## Lint/Refactor Overlap Resolution Plan (2026-02-14)

### Current-state findings
1. `lint` already owns migrated formatter-era rewrites via ESLint rules (`gml/no-globalvar`, `gml/prefer-loop-length-hoist`, `gml/prefer-struct-literal-assignments`, `gml/prefer-string-interpolation`) and injects project context in `src/cli/src/commands/lint.ts`.
2. `refactor` still owns symbol-driven, cross-file, transactional rename workflows and hot-reload-aware planning via `RefactorEngine`, and is still the backing implementation for `cli refactor` in `src/cli/src/commands/refactor.ts`.
3. There is real overlap in project-aware helper surfaces:
   - `lint` context: `isIdentifierNameOccupiedInProject`, `listIdentifierOccurrenceFiles`, `planFeatherRenames`, `assessGlobalVarRewrite`, `resolveLoopHoistIdentifier`.
   - `refactor` engine: `isIdentifierOccupied`, `listIdentifierOccurrences`, `planFeatherRenames`, `assessGlobalVarRewrite`, `resolveLoopHoistIdentifier`.
4. The two stacks currently use different analysis strategies (lint local index vs refactor semantic-backed bridge), which risks behavior drift over time.

### Target-state architecture (direct end state)
1. `@gml-modules/lint` is the only owner of project-aware lint diagnostics and autofix rewrites.
2. `@gml-modules/refactor` is the only owner of explicit rename/refactor transactions (cross-file edits, metadata edits, impact analysis, hot-reload validation).
3. Shared project-analysis answers are produced by one semantic-backed provider contract consumed by both workspaces.
4. No duplicate capability logic is allowed across lint and refactor surfaces.
5. No legacy support is added: no wrappers, aliases, compatibility toggles, or parallel code paths.

### Required end-state changes
1. Define a single `ProjectAnalysisProvider` contract (semantic-backed) that returns:
   - identifier occupancy
   - identifier occurrence file sets
   - rename-collision planning results
   - loop-hoist identifier resolution
   - globalvar rewrite safety assessment
2. Replace lint-local analysis implementations with provider-backed implementations.
3. Replace refactor-overlap helper implementations with provider-backed implementations.
4. Remove duplicated helper semantics from public APIs where they are not part of each workspace’s core responsibility:
   - lint exports rule-consumption context only
   - refactor exports rename/refactor transaction APIs only
5. Remove stale dependency and documentation coupling that implies lint/refactor cross-ownership.
6. Enforce capability parity through shared-provider contract tests (same snapshot => same answers).

### Capability ownership matrix (target state)
1. Identifier occupancy checks: implementation owner = shared provider; lint/refactor = consumers.
2. Identifier occurrence-file lookup: implementation owner = shared provider; lint/refactor = consumers.
3. Rename conflict planning for lint-safe rewrites: implementation owner = shared provider; lint/refactor = consumers as needed.
4. Loop hoist replacement-name resolution: implementation owner = shared provider; lint = primary consumer.
5. Globalvar rewrite safety checks: implementation owner = shared provider; lint = primary consumer.
6. Cross-file transactional rename planning/application: implementation owner = refactor only; lint does not own this capability.
7. Metadata rewrite/edit orchestration for `.yy/.yyp`: implementation owner = refactor only; lint does not own this capability.

### Completion criteria (target state)
1. Exactly one implementation path exists for each shared project-aware capability.
2. `lint` and `refactor` no longer carry duplicated project-analysis logic.
3. `cli lint` and `cli refactor` each execute against their single-owner domains without compatibility fallbacks.
4. Docs and dependency-policy tests describe and enforce the same final ownership model.

## Public API Contracts
Public, semver-governed API surfaces for `@gml-modules/lint` consumers and CLI-facing preset behavior.

## Public API and Workspace Changes
1. Add new workspace at `src/lint` with package name `@gml-modules/lint`.
2. Keep `src/plugin` as formatter-only (`@gml-modules/plugin`).
3. Add lint command implementation in `src/cli/src/commands/lint.ts`.
4. Root namespace export for lint package:
   ```ts
   // src/lint/index.ts
   export { Lint } from "./src/index.js";
   ```
5. Lint namespace export surface:
   ```ts
   // src/lint/src/index.ts
   export const Lint = Object.freeze({
     plugin,      // ESLint plugin object (rules + languages)
     configs,     // recommended / feather / performance
     ruleIds,     // frozen map of canonical rule IDs
     services     // project-context factories + helpers
   });
   ```
6. `Lint.ruleIds` contract:
   - `ruleIds` is a frozen, full-ID map for both `gml/*` and `feather/*` rules.
   - map values are canonical full ESLint rule IDs (for example `gml/no-globalvar`, `feather/gm1051`), not short names.
   - map keys use stable PascalCase identifiers with namespace prefixes to avoid collisions:
     - `Gml<RuleName>` (for example `GmlNoGlobalvar`)
     - `FeatherGM####` (for example `FeatherGM1051`)
   - keys are semver-public and stable across minor/patch; removals/renames are semver-major only.
   - values are semver-public and stable across minor/patch; rule-ID removals/renames are semver-major only.
   - object key iteration order is not semver-public and must not be used as a behavioral contract.
7. `Lint.configs` contract:
   - `configs.recommended`, `configs.feather`, and `configs.performance` are readonly flat-config arrays (`FlatConfig[]` shape), not functions.
   - each config surface is directly consumable in `eslint.config.*` via array spread.
   - shared files-glob contract:
     - all shipped lint presets use the same files-glob source (`GML_LINT_FILES_GLOB`), currently `["**/*.gml"]`.
     - `recommended`, `feather`, and `performance` must remain glob-aligned by deriving from that shared source.
     - changing `GML_LINT_FILES_GLOB` for shipped presets is semver-major.
   - composition model:
     - `configs.recommended`: complete preset with `files` + `plugins` + `language` wiring and recommended gml rules.
     - `configs.feather`: overlay preset intended to be spread after `recommended`; contains `files: ["**/*.gml"]` guard and feather-rule entries only (no duplicate language wiring block).
     - `configs.performance`: overlay preset intended to be spread after `recommended`; contains `files: ["**/*.gml"]` guard and performance tuning rule entries only (no duplicate language wiring block).
   - overlay dependency contract:
     - supported usage is `recommended` + overlay(s), or overlay(s) with an equivalent user-provided `plugins` + `language` wiring block.
     - overlays alone do not provide complete language wiring and are not standalone presets.
     - equivalent user-provided wiring means all of:
       - `plugins.gml` is reference-equal to `Lint.plugin` (identity, not shape-equivalent cloning).
       - `language: "gml/gml"`
       - `files` scope equal to the overlay `files` guard (`GML_LINT_FILES_GLOB`).
     - when overlays are used without required language wiring, behavior is unsupported; docs must direct users to compose overlays only with `recommended` (or the pinned equivalent wiring above).
   - feather severity source:
     - `configs.feather` default severities come from feather parity manifest `defaultSeverity` values.
     - severity mapping is exact: manifest `warn` -> ESLint `"warn"`, manifest `error` -> ESLint `"error"`.
     - `configs.feather` does not set feather rules to `"off"` by default.
   - performance preset scope:
     - does not change parsing mode (`languageOptions.recovery` unchanged unless explicitly overridden by user config).
     - affects only `gml/*` rules listed in this plan’s performance appendix baseline; it does not modify `feather/*` severities.
     - applies severity/enablement overrides only and does not change rule option objects.
     - source of truth for performance-targeted rule IDs is a frozen constant `PERFORMANCE_OVERRIDE_RULE_IDS` in lint workspace code (`src/lint/src/configs/performance-rule-ids.ts`).
     - `PERFORMANCE_OVERRIDE_RULE_IDS` contains canonical full ESLint rule IDs (for example `gml/prefer-loop-length-hoist`), matching `Lint.ruleIds` value forms.
     - `PERFORMANCE_OVERRIDE_RULE_IDS` contents must match this plan’s performance appendix baseline and are semver-major to change.
   - canonical composition order and precedence:
     - recommended only: `...Lint.configs.recommended`
     - recommended + feather: `...Lint.configs.recommended, ...Lint.configs.feather`
     - recommended + performance: `...Lint.configs.recommended, ...Lint.configs.performance`
     - recommended + feather + performance: `...Lint.configs.recommended, ...Lint.configs.feather, ...Lint.configs.performance`
     - later flat-config entries win on conflict; user-authored overrides should be placed last.
8. Feather manifest export contract:
   - parity manifest is exported as typed runtime data from lint workspace code (not generated ad-hoc at runtime).
   - manifest schema version is explicit (`schemaVersion`) and semver-governed.

## ESLint v9 Language Wiring Contract (Pinned)
1. `Lint.plugin` is the object registered under `plugins.gml`.
   - public contract scope: `Lint.plugin` is the rules/languages surface; preset configs are semver-governed through `Lint.configs`.
2. `Lint.plugin.languages.gml` is the ESLint v9 language object used via `language: "gml/gml"`.
3. This migration implements a **language plugin**, not `languageOptions.parser`.
4. Commonly used flat-config keys in blocks applying `language: "gml/gml"` are `files`, `ignores`, `plugins`, `language`, `languageOptions`, `rules`, `linterOptions` (documentation only).
5. Minimal real config (no duplicated language wiring when using `recommended`):
   ```ts
   import { Lint } from "@gml-modules/lint";

   export default [
     ...Lint.configs.recommended,
     {
       rules: {
         "gml/prefer-loop-length-hoist": ["warn", { functionSuffixes: { array_length: "len" } }],
         "gml/no-globalvar": "error",
         "feather/gm1051": "error"
       }
     }
   ];
   ```

## Recommended Config Contract (Pinned)
1. `Lint.configs.recommended` is a complete flat-config preset, not rule-only.
2. It already includes:
   - `files: ["**/*.gml"]`
   - `plugins: { gml: Lint.plugin }`
   - `language: "gml/gml"`
   - baseline recommended rules/severities
3. Users extending `Lint.configs.recommended` should not re-declare the same language wiring unless intentionally overriding.
4. CLI fallback behavior is explicit policy:
   - when no user flat config is discovered, CLI applies `Lint.configs.recommended`
   - unless `--quiet`, CLI prints: “No user flat config found; using bundled defaults,” plus searched locations
   - `--no-default-config` disables fallback.
5. Preset stability/semver policy:
   - adding new enabled rules to `recommended` is semver-major
   - changing default severities for existing `recommended` rules is semver-major
   - bug-fix-only behavior corrections inside an existing rule remain semver-minor/patch as appropriate.
6. Direct-ESLint interaction policy:
   - `recommended` is CLI-first and may include project-aware rules.
   - when used outside CLI-managed project context injection, those rules may emit `missingProjectContext` diagnostics until users either run via CLI or disable those rules.
7. Direct-ESLint-friendly workflow:
   - for direct `eslint` usage, users should disable rules that require project context.
   - this migration does not require shipping a separate local-only preset.
8. Canonical preset inventory:
   - this plan includes an explicit appendix listing the exact `recommended` rules + severities and the derived project-aware subset.

## CLI Loading, Discovery, Merging, and Output (Pinned)
1. `lint <paths...>` delegates file enumeration to ESLint `lintFiles()`.
   - stdin/virtual-text lint mode is not supported in this migration.
   - CLI uses process `cwd` as ESLint `cwd` for discovery/resolution.
   - overlay UX guardrail:
     - per-file resolved config view is read via `ESLint#calculateConfigForFile(filePath)`.
     - wiring presence is determined only from that resolved config object: wired only when `config.plugins?.gml === Lint.plugin` and `config.language === "gml/gml"`.
     - any other resolved wiring combination (including present-but-non-identical `plugins.gml`) is treated as not wired.
     - if either wiring field is missing/`undefined` in the resolved view, treat as not wired; do not use alternate inference paths.
     - if `config.rules` is missing/`undefined` in the resolved view, treat as no applied rules for guardrail evaluation.
     - severity normalization for applied-rule detection:
       - treat rule as off when value is `"off"` or `0`, or when value is an array whose first element is `"off"` or `0`.
       - treat rule as applied when value is `"warn"`/`"error"` or `1`/`2`, or when value is an array whose first element is `"warn"`/`"error"` or `1`/`2`.
       - recognized forms are `"off"|"warn"|"error"|0|1|2`, or arrays whose first element is one of those values.
       - anything else (including `null`, booleans, objects, and empty arrays) is treated as applied (conservative) for guardrail purposes and must not crash guardrail evaluation.
     - canonical full-ID matching for `PERFORMANCE_OVERRIDE_RULE_IDS` uses case-sensitive string equality against rule ID keys in `config.rules` (no aliasing, no normalization, no short-name expansion).
     - CLI emits `GML_OVERLAY_WITHOUT_LANGUAGE_WIRING` at most once per invocation (deduped) when one or more linted `.gml` files meet the guardrail condition: resolved config has any applied rule whose ID starts with `feather/` or is a canonical full ID in `PERFORMANCE_OVERRIDE_RULE_IDS`, and the same resolved config does not include both `plugins.gml === Lint.plugin` and `language: "gml/gml"` for that file.
     - deduped warning output includes a bounded sample of offending file paths (up to 20 paths, then “and N more…”).
2. If `--config` is provided, CLI sets `overrideConfigFile` to that path.
3. If `--config` is absent, CLI uses ESLint flat-config discovery over this candidate filename set:
   - `eslint.config.js`
   - `eslint.config.mjs`
   - `eslint.config.cjs`
   - `eslint.config.ts`
   - `eslint.config.mts`
   - `eslint.config.cts`
   - discovery traverses ancestor directories from `cwd` to filesystem root using ESLint resolution rules.
   - `package.json`-embedded config is not part of this flat-config discovery path.
   - discovery origin is always CLI `cwd` (lint targets outside `cwd` do not change discovery origin unless `--config` is provided).
4. If no user config is found, CLI falls back to bundled `Lint.configs.recommended`.
   - this is an explicit policy choice, not implicit ESLint behavior.
   - fallback can be disabled via `--no-default-config`.
   - fallback message includes actionable next steps (`--no-default-config` and config file locations searched).
   - docs must list exact rules active in fallback mode.
   - searched-location reporting lists each traversed directory with candidate filenames and whether a config was selected.
   - if multiple candidate config files exist in the same directory, ESLint’s native selection rules determine the chosen file; CLI reports the selected path and does not merge sibling config files itself.
5. `--config` failure behavior:
   - if `--config` points to a missing/unreadable/invalid file, CLI exits with code `2` and does not apply fallback defaults.
   - fallback applies only when discovery finds no user config and `--config` is not provided.
6. `ignores` are flat-config-driven; `.eslintignore` is not used.
7. Supported formatter values are `stylish`, `json`, `checkstyle`, all via `ESLint.loadFormatter()`.
8. `checkstyle` requires `eslint-formatter-checkstyle` at runtime.
9. Exit codes:
   - `0`: no errors and warnings within threshold.
   - `1`: lint errors exist or `--max-warnings` exceeded.
   - `2`: config/runtime/formatter loading failures.

## Direct ESLint Usage Compatibility (Pinned)
1. Direct `eslint` usage without the CLI is supported for syntactic and local rules.
2. Project-aware rules require project context injection from the CLI runtime.
3. The missing-context contract (messageId, fix suppression, emission frequency, and `reportUnsafe` interaction) is defined in **Rule Access to Language Services (Pinned)** and applies identically in direct-ESLint and CLI flows.
4. Example-only direct-ESLint config (disable selected project-aware rules):
   ```ts
   import { Lint } from "@gml-modules/lint";

   export default [
     ...Lint.configs.recommended,
     {
       rules: {
         "gml/prefer-loop-length-hoist": "off",
         "gml/no-globalvar": "off"
       }
     }
   ];
   ```
5. Documentation requirement:
   - docs must include an auto-generated list of project-aware rule IDs (derived from `meta.docs.requiresProjectContext`) for direct-ESLint disable workflows.

## Formatter Boundary (Pinned)
1. Formatter may only perform layout and canonical rendering transforms.
2. Formatter must not perform semantic/content rewrites or syntax repair.
3. `logicalOperatorsStyle` remains formatter-only and is limited to canonical alias rendering of equivalent logical operators.
4. `normalizeDocComments` moves to lint because it mutates comment text content.
5. Invalid code handling:
   - Formatter parses strictly.
   - On parse failure, formatter fails and does not mutate source.
   - Syntax repairs are lint-only (`lint --fix`).

## Formatter Transform Allowlist (Pinned)
1. Allowed formatter transforms are limited to:
   - indentation/whitespace normalization
   - line-break wrapping and blank-line normalization
   - spacing around punctuation/operators
   - parenthesis/grouping rendering that does not change semantics
   - trailing delimiter layout where grammar-equivalent
   - final newline normalization at EOF
   - `logicalOperatorsStyle` alias canonicalization as documented below
2. Comment policy:
   - comment placement may be reflowed for layout.
   - comment text content must remain verbatim unless a dedicated lint rule owns that content transform.
3. Formatter must not:
   - rewrite identifiers/literals for semantics/content purposes
   - perform syntax repair
   - apply cross-file or project-aware rewrites.

## Logical Operator Canonicalization Scope (Pinned)
1. `logicalOperatorsStyle` affects only logical operator aliases:
   - symbolic forms: `&&`, `||`
   - keyword forms: `and`, `or`
2. Canonicalization policy:
   - `keywords` mode rewrites `&&` -> `and` and `||` -> `or`
   - `symbols` mode rewrites `and` -> `&&` and `or` -> `||`
   - mixed usage is normalized to one canonical style per file output
3. Non-target operators are never rewritten by this option (`&`, `|`, `^`, `xor`, `!`, `not`, comparison operators, arithmetic operators).
4. Operator equivalence for this formatter option is treated as a language-level assumption and must be covered by regression tests.

## Required Before/After Examples in the Doc
1. Loop hoist:
   - Before: `for (var i = 0; i < array_length(items); i++) {}`
   - After: `var items_len = array_length(items); for (var i = 0; i < items_len; i++) {}`
2. Globalvar rewrite:
   - Before: `globalvar score; score = 0;`
   - After (safe): `global.score = 0;`
3. Missing separators:
   - Before: `draw_text(x y "score");`
   - After: `draw_text(x, y, "score");`

## Syntax Variant Note for Examples (Pinned)
1. Documentation examples must only use syntax accepted by the shipped parser grammar.
2. `for` initializer examples may use either:
   - inline declaration form (`for (var i = 0; ... )`)
   - predeclared initializer form (`var i = 0; for (i = 0; ... )`)
3. Migration docs should include at least one valid example for each supported variant when rule behavior differs by syntax form.

## Recommended Rule Baseline Appendix (Pinned)
1. `Lint.configs.recommended` canonical rule set (initial migration baseline):
   | Rule ID | Default Severity | Project-Aware |
   |---|---:|---:|
   | `gml/prefer-loop-length-hoist` | `warn` | `yes` |
   | `gml/prefer-hoistable-loop-accessors` | `warn` | `no` |
   | `gml/prefer-struct-literal-assignments` | `warn` | `yes` |
   | `gml/optimize-logical-flow` | `warn` | `no` |
   | `gml/no-globalvar` | `warn` | `yes` |
   | `gml/normalize-doc-comments` | `warn` | `no` |
   | `gml/prefer-string-interpolation` | `warn` | `yes` |
   | `gml/optimize-math-expressions` | `warn` | `no` |
   | `gml/require-argument-separators` | `error` | `no` |
2. `recommended` does not enable `feather/*` rules by default; use `Lint.configs.feather` for feather diagnostics.
3. Derived project-aware rule IDs are generated from `meta.docs.requiresProjectContext === true` and must match this appendix.
4. Any change to this appendix must be accompanied by matching updates to fallback-mode docs/tests and config snapshots.
5. `Lint.configs.feather` baseline:
   - composition: overlay preset with `files: ["**/*.gml"]` guard and feather-rule entries only; no language/plugin wiring.
   - enables all feather parity rules listed in this plan.
   - severity source: per-rule `defaultSeverity` from feather parity manifest.
   - standalone note: supported when paired with `recommended` (or equivalent user-provided language/plugin wiring).
6. `Lint.configs.performance` baseline:
   - composition: overlay preset with `files: ["**/*.gml"]` guard and `gml/*` severity/enablement overrides only; no language/plugin wiring.
   - source-of-truth rule-ID set is frozen constant `PERFORMANCE_OVERRIDE_RULE_IDS` (`src/lint/src/configs/performance-rule-ids.ts`).
   - `PERFORMANCE_OVERRIDE_RULE_IDS` entries are canonical full ESLint rule IDs.
   - disables or downgrades project-aware expensive rules:
     - `gml/prefer-loop-length-hoist`: `off`
     - `gml/prefer-struct-literal-assignments`: `off`
     - `gml/no-globalvar`: `warn`
     - `gml/prefer-string-interpolation`: `off`
   - keeps parse behavior unchanged (`recovery` default unchanged).
   - does not modify `feather/*` severities and does not alter rule option objects.
7. Canonical overlay composition patterns for docs/examples:
   - `...Lint.configs.recommended`
   - `...Lint.configs.recommended, ...Lint.configs.feather`
   - `...Lint.configs.recommended, ...Lint.configs.performance`
   - `...Lint.configs.recommended, ...Lint.configs.feather, ...Lint.configs.performance`
   - precedence follows flat-config order (later entries override earlier entries).

## Internal Implementation Contracts
Internal/runtime contracts for language integration, indexing lifecycle, parser services, and compatibility enforcement.

## ESLint v9 Language Object Interface (Pinned)
1. `Lint.plugin.languages.gml` implements the ESLint v9 `Language` interface exactly as documented by ESLint/@eslint-core for the pinned major version.
2. Implemented language methods (pinned for `>=9.39.0 <10`):
   - `parse(...)`
   - `createSourceCode(...)`
   - `validateLanguageOptions(...)`
   - optional fields/methods such as `languageOptionsSchema` are supported only if required by ESLint v9 contract tests for the pinned range.
3. Method names/signatures follow ESLint’s language contract for v9; contract tests pin expected signatures and return channels for this version range.
4. Pinned GML language behavior on top of that interface:
   - `fileType: "text"`
   - `lineStart: 1`
   - `columnStart: 0`
   - `nodeTypeKey: "type"`
   - `defaultLanguageOptions: { recovery: "limited" }`
   - `visitorKeys: GML_VISITOR_KEYS`
5. Language options contract:
   ```ts
   type GmlLanguageOptions = Readonly<{
     recovery: "none" | "limited";
   }>;
   ```
6. `parse(...)` return-channel contract (single source of truth):
   - `parse(...)` returns the structure ESLint expects for the pinned version range (`>=9.39.0 <10`), validated by runtime contract tests.
   - success returns ESLint-compatible parse success payload containing AST + parser services for `createSourceCode(...)`.
   - parse failure returns through ESLint v9 parse-failure return channel (no uncaught throw).
   - exact object field names are pinned by runtime contract tests against the installed ESLint version.
   - semver-governed stability for consumers is the rule-facing output contract (`parserServices.gml`, AST/token/comment invariants), not raw parse-channel field names.
   - documentation aliases below describe the normalized internal adapter view used by tests/docs; they are not semver-public runtime field-name guarantees:
     ```ts
     type GmlParseSuccessAlias = {
       ast: Program;
       parserServices: { gml: GmlParserServices };
       visitorKeys: VisitorKeys;
     };

     type GmlParseFailureAlias = {
       errors: ReadonlyArray<{
         message: string;
         line: number;
         column: number;
         endLine?: number;
         endColumn?: number;
       }>;
     };
     ```
   - these aliases are internal language-implementation documentation, not a semver-public API for external consumers.
   - if ESLint v9 minors require channel adjustments, the language implementation may adapt internally while preserving documented rule-facing contracts (`parserServices.gml`, AST/token/comment invariants).
7. Parse failure contract:
   - Parse failures are surfaced through ESLint v9’s documented language parse-failure mechanism (returned, not thrown uncaught).
8. `createSourceCode(...)` contract:
   - receives the parse success payload for the same file and uses these fields: `ast`, `parserServices`, and `visitorKeys`, plus ESLint-provided file text/filename context.
   - field-level compatibility with ESLint v9 is pinned by runtime contract tests.
   - filename source of truth is ESLint’s per-file filename input for that parse call.
   - `parserServices.gml.filePath` must be derived from that filename via this normalization pipeline: absolute resolution -> realpath when available -> fallback to resolved absolute path when realpath fails -> normalize separators to platform-native -> remove trailing separators except canonical filesystem root forms.
   - no custom `SourceCode` subclass is used in this migration.
9. SourceCode contract:
   - Implementation uses ESLint `SourceCode` (no custom SourceCode class), so `getText()`, token APIs, comment APIs, and location helpers behave per ESLint defaults.
10. Scope analysis contract:
   - No custom scope manager is provided by the language object in this migration.
   - Rules requiring project-wide analysis use `Lint.services` (project context), not ESLint scope-manager extensions.
   - lexical-scope-heavy rules (for example unused/shadowing diagnostics) are out of scope for this migration unless they can be expressed with local AST/`SourceCode` analysis.
11. `validateLanguageOptions(...)` contract:
   - language-option validation is performed in this method using effective file-level options supplied by ESLint.
   - unsupported options fail with stable error codes documented in **Language Options Validation UX (Pinned)**.
12. `parserServices` contract:
   - `parserServices.gml` is always present on successful parse with language-specific metadata required by GML rules.
   - Recovery metadata (for example inserted separator locations) is exposed via `parserServices.gml.recovery`.
13. Conformance tests are required:
   - Type-level conformance against installed ESLint v9 language typings.
   - Runtime contract tests that verify method presence/behavior on the actual language object.

## Language Options Validation UX (Pinned)
1. Validation uses the effective file-level language options provided by ESLint for that file; the CLI does not re-implement flat-config merge logic.
2. `validateLanguageOptions()` is the canonical validation hook.
3. `languageOptionsSchema` (if present for ESLint integration ergonomics) is advisory; runtime enforcement is defined by `validateLanguageOptions()`.
4. Unsupported keys (`languageOptions.parser`, `languageOptions.parserOptions`) fail fast with a stable error code: `GML_LANGUAGE_OPTIONS_UNSUPPORTED_KEY`.
5. Validation errors include:
   - offending key path
   - allowed keys
   - actionable hint to use `language: "gml/gml"` and plugin rules instead
6. Any validation failure is treated as a runtime/config failure and maps to CLI exit code `2`.
7. Processor handling policy:
   - processors are unsupported only for files linted as `language: "gml/gml"` (not globally for other file types in the same invocation)
   - active-processor detection uses ESLint’s resolved per-file config view (for example `ESLint#calculateConfigForFile(...)`) rather than custom merge logic.
   - enforcement is conditional on observability: ESLint must expose active processor identity for the current `.gml` file at runtime
   - configured-but-not-applied processors must not trigger failure; only the active processor for the current linted `.gml` file is considered
   - if active processor is observable and is not default/none, fail with `GML_PROCESSOR_UNSUPPORTED`
   - if processor is configured elsewhere but not active for the current `.gml` file, do not fail
   - if processor status is not observable, do not attempt custom enforcement; emit one `--verbose` warning code `GML_PROCESSOR_OBSERVABILITY_UNAVAILABLE`.
8. Default/none processor equivalence:
   - values that represent “no active processor” in ESLint v9 (for example `undefined`, `null`, or empty-string-like sentinel values if exposed) are treated equivalently as default/none.
   - exact observable values are verified by ESLint contract tests for the pinned version range.

## Parser Services Interface (Pinned)
1. Stable minimal `parserServices.gml` interface:
   ```ts
   type GmlParserServices = {
     schemaVersion: 1;
     filePath: string; // normalized absolute path from ESLint filename (realpath when available; fallback absolute path), platform-native separators, no trailing separator (except filesystem root forms)
     recovery: ReadonlyArray<GmlRecoveryInsertion>;
     directives: ReadonlyArray<GmlDirectiveInfo>;
     enums: ReadonlyArray<GmlEnumInfo>;
   };
   ```
   `filePath` root normalization invariant:
   - filesystem roots are normalized to canonical root forms for the platform (for example `/`, `C:\\`, `\\\\server\\share\\`).
   - UNC roots are supported in this migration and normalized to canonical share-root form (`\\\\server\\share\\`).
2. `GmlRecoveryInsertion` stable entry shape:
   ```ts
   type GmlRecoveryInsertion = {
     kind: "inserted-argument-separator";
     offset: number; // original-source UTF-16 offset
     loc: { line: number; column: number };
     callRange: [number, number]; // recovered CallExpression node range projected to original source
     argumentIndex: number; // index within recovered AST call-argument list (0-based)
   };
   ```
3. `GmlDirectiveInfo` stable entry shape:
   ```ts
   type GmlDirectiveInfo = {
     directiveKind: "region" | "endregion" | "define";
     text: string; // raw original-source slice for the directive node range (including directive prefix)
     range: [number, number];
     loc: {
       start: { line: number; column: number };
       end: { line: number; column: number };
     };
     nodeType: "GmlDirectiveStatement";
     nodeRange: [number, number]; // currently equal to `range`
     defineName: string | null; // non-null when `directiveKind === "define"`
     defineNameRange: [number, number] | null; // non-null when `directiveKind === "define"`
   };
   ```
   - `defineNameRange` follows standard range semantics in this plan: original-source UTF-16 `[start, end)`.
   - when non-null, `defineName` must equal the exact original-source substring at `defineNameRange`.
4. `GmlEnumInfo` stable entry shape:
   ```ts
   type GmlEnumInfo = {
     name: string;
     range: [number, number];
     loc: {
       start: { line: number; column: number };
       end: { line: number; column: number };
     };
     nodeType: "GmlEnumDeclaration";
     nodeRange: [number, number]; // currently equal to `range`
     members: ReadonlyArray<{
       name: string;
       range: [number, number];
       nodeType: "GmlEnumMember";
       nodeRange: [number, number]; // currently equal to `range`
     }>;
   };
   ```
5. `parserServices.gml` intentionally does not expose CST internals; rules consume AST + `SourceCode` + this stable metadata only.
6. Additional parser-service fields may exist internally, but rules must not rely on non-documented fields in this plan.
7. Stability policy:
   - changes to documented `GmlParserServices` fields/shapes are semver-major for `@gml-modules/lint`.
8. Recovery invariants:
   - all recovery metadata (`offset`, `loc`, `callRange`) is projected to original-source coordinates.
   - `callRange` references the recovered AST call node range after projection back to original source.

## AST/Token/Comment Contract (Pinned)
1. Output model is ESTree-compatible plus explicit GML extension node types.
2. `range` is always `[start, end)` in UTF-16 code-unit offsets.
3. `loc` is always `line: 1-based`, `column: 0-based`.
4. On successful `.gml` parse, `Program.comments` and `Program.tokens` are always present as arrays (possibly empty).
5. On parse-failure return channel, no `Program` AST is emitted for rule execution.
6. GML-to-ESTree mapping rules:
   | GML construct | Output node |
   |---|---|
   | `Program` | `Program` |
   | `MemberDotExpression` | `MemberExpression { computed: false }` |
   | `MemberIndexExpression` | `MemberExpression { computed: true }` |
   | `TemplateStringExpression` | `TemplateLiteral` |
   | `TemplateStringText` | `TemplateElement` |
   | `WithStatement` | ESTree `WithStatement` |
   | `GlobalVarStatement` | `VariableDeclaration` + extension field `gmlKeyword: "globalvar"` |
   | `MacroDeclaration` | extension node `GmlMacroDeclaration` |
   | `RegionStatement` / `EndRegionStatement` / `DefineStatement` | extension node `GmlDirectiveStatement` with `directiveKind` |
   | `MissingOptionalArgument` | extension node `GmlMissingArgument` |
   | `EnumDeclaration` / `EnumMember` | extension nodes `GmlEnumDeclaration` / `GmlEnumMember` |
7. Custom visitor keys are shipped for every extension node.

## Token and Comment Semantics (Pinned)
1. `Program.tokens` ordering and integrity:
   - strictly source-order
   - non-overlapping ranges
   - each token range maps to a substring in the original file text
2. Token object shape is pinned to ESLint-compatible `SourceCode` token requirements:
   - `type: string`
   - `value: string`
   - `range: [number, number]`
   - `loc: { start: { line, column }, end: { line, column } }`
3. Token type labels must be accepted by ESLint token store semantics for v9; this plan does not overconstrain category names beyond ESLint compatibility.
4. Macro/directive/region syntax contributes both:
   - extension AST nodes in `Program.body`
   - lexical entries in `Program.tokens`
5. Recovery-inserted separators are **not** emitted as synthetic tokens in `Program.tokens`.
   - Recovery insertions are tracked in `parserServices.gml.recovery`.
   - This preserves token-to-source substring guarantees.
6. `Program.comments` includes all comments in source order, each with valid `loc` + `range` and UTF-16 indexing semantics.
7. SourceCode creation uses the AST’s populated `tokens` and `comments` collections directly, ensuring ESLint token/comment APIs remain usable for rule authors.
8. Parse-failure reporting and fatal formatting behavior follow ESLint v9 documented language semantics and are validated by runtime contract tests in the pinned version range.
9. Tokenization-source invariant:
   - token/comment extraction is always based on original source text, not virtual recovery-patched text.
   - token/comment ranges always refer to original source coordinates.
10. Recovery-token stability:
   - virtual separator insertion must not alter token/comment sequence derived from original source text (except that parsing may proceed where strict parse would fail).
11. `SourceCode` substring invariant:
   - `sourceCode.getText(node)` must match the original-source substring referenced by projected `range`.

## Recovery Index Projection Contract (Pinned)
1. Limited recovery may parse against a virtual patched representation of the file (for missing separators only).
2. A monotonic offset-projection map from virtual offsets back to original-source offsets is required.
3. All emitted AST `loc`/`range` and token `loc`/`range` are projected to original-source coordinates.
4. Inserted separators are recorded in `parserServices.gml.recovery` using original-source insertion coordinates.
5. `gml/require-argument-separators` consumes recovery metadata for diagnostics/fixes; other rules observe original-source indexing only.
6. AST/range substring invariants (required):
   - for every emitted node: `0 <= start <= end <= sourceText.length`
   - projected node range must map to the correct original-source substring
   - fixer-targeted ranges must not split UTF-16 surrogate pairs.
7. Token/comment extraction pipeline:
   - token/comment extraction is performed by lexing original source text.
   - token/comment output is not derived from parsing virtual recovery-patched input.

## Extension Node Placement and Traversal (Pinned)
1. Extension nodes (`GmlMacroDeclaration`, `GmlDirectiveStatement`, `GmlMissingArgument`, `GmlEnumDeclaration`, `GmlEnumMember`) are first-class AST nodes and may appear in `Program.body` and nested statement lists where syntactically valid.
2. All extension nodes are traversable through `visitorKeys` and selector-based rule traversal; they are not hidden side channels.
3. Rule authoring contract:
   - Rules may report on extension nodes.
   - Rules may autofix extension-node findings only with local single-file edits.
   - Rules must not rely on extension nodes being absent when linting mixed syntax files.
4. Contract tests must verify selector-based traversal can match each extension node type.

## Parse Errors and Recovery Contract (Pinned)
1. Language parse never throws uncaught exceptions to ESLint.
2. `languageOptions.recovery` options:
   - `"none"`: strict parse only.
   - `"limited"` (default): run only missing-argument-separator recovery before parse.
3. If strict/limited parse fails, parse failures are returned through ESLint v9’s documented language parse-failure channel (not thrown uncaught).
4. Parse diagnostic formatting details are treated as ESLint behavior within the pinned version range and are verified by contract tests; they are not part of this plan’s stable public API.
5. Fatal parse diagnostics are not rule-configurable (ESLint standard behavior).
6. Recovered separators are reported by `gml/require-argument-separators` with configurable severity and autofix.
7. Lint continues across other files even when some files have parse failures.
8. Rule execution implication:
   - when parse fails for a file, rules do not execute for that file.
   - therefore, for invoked rules on successfully parsed files, `parserServices.gml` can be assumed present.

## Parser Services Presence Rules (Pinned)
1. On parse failure, rules do not run for that file and `parserServices.gml` is absent.
2. On successful parse without recovery edits, `parserServices.gml` is present and `parserServices.gml.recovery` exists as an empty collection.
3. On successful parse with limited recovery edits, `parserServices.gml` is present and `parserServices.gml.recovery` contains projected insertion metadata.
4. On successful parse, `parserServices.gml.directives` and `parserServices.gml.enums` are arrays (possibly empty).
5. On successful parse, `Program.tokens` and `Program.comments` are arrays (possibly empty).
6. On parse failure, there is no AST/`Program`, therefore no token/comment arrays are available to rules.

## Project Root, Indexing, and Cache Lifecycle (Pinned)
1. CLI adds `--project <path>` as explicit project-root override.
   - `--project` accepts either a directory path or a `.yyp` file path.
   - when a `.yyp` file is provided, its parent directory is used as forced project root.
   - relative `--project` paths are resolved against CLI `cwd` before normalization.
2. Without `--project`, root resolution is nearest ancestor containing a GameMaker manifest (`.yyp`) from each linted file path; fallback is CLI `cwd`.
   - root discovery resolves candidate paths through `realpath` before `.yyp` ancestry checks.
   - if realpath resolution fails for a candidate lint target, runtime falls back to resolved absolute path for that target and treats project-aware services for that file as missing-context.
   - in this realpath-failure case, lint still runs local/non-project-aware rules for the file; project-aware rules emit `missingProjectContext` (once per file per rule) and do not crash.
   - symlinks are normalized to canonical paths for registry keys and deduplication.
   - discovery is per concrete lint target file after ESLint file enumeration.
3. Runtime owns one invocation-scoped `ProjectLintContextRegistry` keyed by resolved root.
   - canonicalization invariant: project-root resolution, registry keying, forced-root out-of-root checks, and `getContext(filePath)` lookups all use the shared file-path normalization pipeline defined in this plan.
4. Each context indexes `.gml` sources under root once, using semantic/refactor-backed analysis data, with hard excludes: `.git`, `node_modules`, `dist`, `generated`, `vendor`.
   - required analysis inputs are workspace APIs from `@gml-modules/semantic` and `@gml-modules/refactor`.
   - required analysis outputs include identifier-occupancy, cross-file occurrence lists, loop-hoist naming constraints, and rename/conflict planning data used by `ProjectContext` helpers.
   - indexing is in-memory for the invocation; no on-disk cache is read or written in this migration.
   - if analysis is partial/unavailable for a file set, affected project-aware checks degrade to missing-context behavior rather than guessing.
5. Context is immutable for the lint invocation.
6. Under `--fix`, project-aware decisions use pre-fix snapshot state for all passes in that invocation.
7. No cross-file writes are allowed by any rule fixer.
8. Hard excludes are indexing defaults and can only be overridden by CLI indexing flags (not by flat-config globs).
9. Index scope is intentionally broader than lint target scope:
   - ESLint decides which files are linted.
   - Project context indexes all eligible `.gml` files under resolved root (after hard excludes) to preserve cross-file correctness checks.
10. Performance bound:
    - project index builds once per root per invocation
    - full eligible-project indexing is intentional for cross-file correctness; this cost is accepted policy in this migration
    - rules lazily query context services; no eager full-project rewrite planning unless a rule needs it
11. Debuggability requirement:
    - `--verbose` output includes resolved project root plus excluded directory classes to explain indexing decisions.
12. Exclusion rationale:
    - hard excludes are treated as safety/performance boundaries, not user-style ignores.
13. Safety invariant for excluded paths:
    - excluded files are treated as unknown code for project-aware safety checks
    - unknowns provide no positive evidence of safety
    - unknown/excluded code can only force conservative decisions until additional indexed evidence is available.
14. Escape hatch:
    - CLI supports `--index-allow <dir>` to explicitly include otherwise hard-excluded directories in project indexing.
15. Monotonicity invariant:
    - adding indexed files (for example via `--index-allow`) may convert `unsafeFix` -> safe when additional evidence proves safety
    - adding indexed files must not convert safe -> `unsafeFix` unless newly indexed code introduces a real conflict.
16. Multi-root resolution:
    - when multiple `.yyp` roots are present in one invocation, each linted file resolves to its own nearest-ancestor root
    - nested `.yyp` files resolve to the nearest ancestor (deepest match wins)
    - if multiple candidate roots are equivalent after normalization, deterministic tie-break is lexical path order.
    - registry entries are created per resolved root and persist for the full invocation (no eviction).
17. `--project` semantics:
    - `--project` forces project-context root for all lint targets in that invocation
    - lint targets outside forced root are linted, with missing-context handling defined in **Rule Access to Language Services (Pinned)**.
    - out-of-root classification uses the same canonicalized absolute paths as registry/lookups (no separate logical-path comparison path).
    - out-of-root comparison rule: a file is in-root only when canonical `filePath` is under canonical forced root by path-segment boundary comparison (for example, `/root2/file.gml` is not in-root for forced root `/root`).
    - UNC boundary rule uses the same path-segment boundary semantics as drive-letter paths (for example, `\\\\server\\share\\root2\\file.gml` is out-of-root for forced root `\\\\server\\share\\root\\`).
    - CLI emits a warning (unless `--quiet`) listing out-of-root files.
18. `--project-strict` mode:
    - when enabled, any out-of-root lint target is treated as a runtime failure with exit code `2`.
    - this is a runtime/config failure class (exit `2`), not lint-findings failure (exit `1`).
    - CLI error output must include forced root path, offending paths, and a hint to remove `--project` or adjust targets.
19. Project-context initialization failure policy:
    - if project context fails to initialize, CLI applies the missing-context behavior defined in **Rule Access to Language Services (Pinned)** and continues linting syntactic/local rules.
    - CLI emits a top-level warning banner (unless `--quiet`) with failure reason summary.
    - `--verbose` includes detailed initialization failure diagnostics.
    - initialization failure is non-fatal by default (degrade-and-continue); this condition does not escalate to exit code `2` unless an explicit future strict-init mode is introduced.
20. Out-of-root warning output policy:
    - warnings are aggregated at command level and include a bounded path sample.
    - output shows at most 20 paths, then summarizes remainder as “and N more…”.

## Project Analysis Inputs and Outputs (Pinned)
1. Context indexing consumes semantic/refactor workspace APIs as the only authoritative project-analysis inputs for this migration.
2. Minimum required analysis outputs per root:
   - identifier occupancy index
   - identifier occurrence locations per file
   - safe loop-hoist name-resolution constraints
   - rename/conflict planning data for feather/global rewrites
3. Capability evaluation model:
   - capability availability is computed per resolved root at index-build time.
   - queries may further gate per file path; unavailable capability for a specific file is treated as missing context for that file/rule.
4. `ProjectContext` helper methods are thin query surfaces over indexed data and must be deterministic for a fixed snapshot.
5. If required analysis output is missing/unsupported/partial for a file set, project-aware rules degrade to `missingProjectContext` behavior for affected files (no silent pass/no optimistic fallback).
6. No persistent cache contract:
   - indexing is invocation-local in-memory state only.
   - no cross-invocation cache files are required or consulted in this migration.

## `--fix` Pass and Snapshot Semantics (Pinned)
1. CLI executes one ESLint invocation with `fix: true` when `--fix` is requested.
2. ESLint may apply its internal fix passes, but the project-aware context remains the original pre-fix filesystem snapshot for the full invocation.
3. Project-aware services never re-read modified file contents produced by current-run fixes.
4. No additional outer “stabilization rerun” is performed by the CLI in this migration.
5. Rule authoring constraint:
   - project-aware fixers must not depend on other fixes having already applied in the same run
   - fix validity must hold against the pre-fix snapshot model; stale snapshot effects must be conservative, never permissive.
6. User-visible consequence:
   - some fixes may be deferred because pre-fix snapshot analysis remains conservative within a single run
   - running `lint --fix` again may unlock additional fixes after earlier edits.

## Assumptions and Defaults
1. Node runtime baseline remains `>=22.0.0` across workspaces.
2. ESLint major is pinned to v9 (`>=9.39.0 <10`) for lint package compatibility.
3. Project-aware context is intentionally immutable per invocation; no in-run incremental reindexing under `--fix`.
4. Formatter and linter remain separate commands and separate responsibilities.
5. ESLint contract test policy:
   - CI runs language/contract tests against the minimum supported ESLint (`9.39.0`) and the latest available version within `<10`.
   - compatibility across intermediate minors is best-effort; min+latest are the gated compatibility points.

## Dependency and Versioning Model (Pinned)
1. `@gml-modules/lint` declares `eslint` as a peer dependency (`>=9.39.0 <10`) and as a dev dependency for workspace tests.
2. `@gml-modules/cli` declares `eslint` as a runtime dependency to provide first-run CLI UX without requiring separate global ESLint installation.
3. `eslint-formatter-checkstyle` is a runtime dependency for checkstyle output mode.
4. Version skew policy:
   - CLI-bundled ESLint version must satisfy `@gml-modules/lint` peer range.
   - CI enforces a single ESLint major (`9.x`) across workspaces.
5. Runtime resolution policy:
   - CLI is the runtime owner of ESLint construction/invocation for `lint` command execution.
   - `@gml-modules/lint` rule/language artifacts are loaded into that ESLint runtime, avoiding mixed ESLint major instances in-process.
6. Instance-identity enforcement:
   - CLI performs a startup assertion that ESLint module identity is shared between CLI runtime and loaded lint language/rule artifacts.
   - identity check compares ESLint class reference equality and `SourceCode` reference equality across CLI/runtime and loaded lint artifacts.
   - mismatch is a hard runtime failure with an actionable diagnostic.
7. Required integration test:
   - run CLI lint in a simulated consumer layout (pnpm-style nested `node_modules`) and assert single-ESLint-instance behavior.

## Rule System Contracts
Rule authoring/runtime behavior contracts, safety diagnostics, fixer boundaries, and parity metadata requirements.

## Rule Access to Language Services (Pinned)
1. Rules access language-specific metadata through `context.sourceCode.parserServices.gml`.
   - canonical path policy: rules and project-context lookups must use `parserServices.gml.filePath`; `context.getFilename()` is informational only.
2. Rules must not infer parse/recovery metadata from `context.languageOptions`; `languageOptions` is configuration input, not parse output.
3. Project-aware data access is via `Lint.services` helpers injected into rule execution context.
4. Injection path is pinned: project services are exposed under `context.settings.gml.project`.
5. Injection ownership is pinned:
   - only the CLI runtime injects `context.settings.gml.project`.
   - in direct ESLint usage, `context.settings.gml.project` is absent by default unless users provide compatible custom injection.
   - CLI injects via ESLint config `settings` for the lint invocation (single ESLint instance context object per invocation).
   - current supported execution model is single-process ESLint invocation for `@gml-modules/cli lint`; worker-concurrency behavior is out of scope for this migration.
6. Rule authors must not invent alternate service discovery paths.
7. Minimum project settings interface:
   ```ts
   type GmlProjectSettings = {
     getContext(filePath: string): ProjectContext | null;
   };
   ```
   - `filePath` input must use the shared normalization pipeline: absolute resolution -> realpath when available -> fallback absolute path when realpath fails -> normalize separators to platform-native -> remove trailing separators except canonical filesystem root forms.
   `ProjectContext` exposes project-aware helpers such as:
   - `capabilities: ReadonlySet<ProjectCapability>`
   - `isIdentifierNameOccupiedInProject`
   - `listIdentifierOccurrenceFiles`
   - `planFeatherRenames`
   - `assessGlobalVarRewrite`
   - `resolveLoopHoistIdentifier`
8. Missing-context behavior:
   - missing context includes all of:
     - `context.settings.gml.project` is absent
     - `getContext` is missing or not callable
     - `getContext(filePath)` returns `null`
     - required project capability for the rule is unavailable in `ProjectContext.capabilities`
   - project-aware rules must perform missing-context checks before any use of `ProjectContext` helpers.
   - project-aware rules must report `messageId: "missingProjectContext"` and emit no fixes.
9. `missingProjectContext` severity/CI semantics:
   - `missingProjectContext` uses the configured severity of its owning rule (ESLint standard severity handling).
   - in `Lint.configs.recommended`, project-aware rule severities are set so `missingProjectContext` is `warn` by default.
   - it counts as a normal warning for `--max-warnings`.
   - it can cause exit code `1` when warning thresholds are exceeded.
10. Emission constraints:
   - project-aware rules emit `missingProjectContext` at most once per file per rule.
   - all project-aware rules must define `missingProjectContext` in `meta.messages`.
   - `missingProjectContext` and `unsafeFix` are mutually exclusive for the same file/rule execution path.
11. `reportUnsafe` interaction:
   - `missingProjectContext` is independent of `reportUnsafe`.
   - `reportUnsafe: false` suppresses unsafe-fix diagnostics only; it does not suppress missing-context diagnostics.
12. Project-aware rule marker:
   - a rule is project-aware if and only if `meta.docs.requiresProjectContext === true`.
   - project-aware rules may call `context.settings.gml.project.getContext()`.
   - local-only rules (`meta.docs.requiresProjectContext !== true`) must not access `context.settings.gml.project` at all.
   - this marker is the source of truth for docs generation, preset composition, and missing-context consistency tests.
13. Message UX invariant:
   - `missingProjectContext` diagnostics must include an actionable hint with both elements:
     - run via CLI with `--project`
     - disable the rule for direct ESLint usage when CLI project context is unavailable.
14. Shared helper recommendation:
   - use a common helper for project-aware rules to report missing context once per file (for example, `reportMissingProjectContextOncePerFile(...)`).
15. Capability model:
   - `ProjectCapability` values are:
     - `IDENTIFIER_OCCUPANCY`
     - `IDENTIFIER_OCCURRENCES`
     - `LOOP_HOIST_NAME_RESOLUTION`
     - `RENAME_CONFLICT_PLANNING`
   - each project-aware rule declares required capabilities in rule metadata.
   - rules must not proceed when required capabilities are unavailable; they emit `missingProjectContext` instead of guessing.
   - metadata field location is pinned:
     - `meta.docs.gml.requiredCapabilities: ReadonlyArray<ProjectCapability>`
   - docs/test generators derive capability requirements from `meta.docs.gml.requiredCapabilities`.

## Standardized “Unsafe to Fix” Reporting
1. Shared helper required for all project-aware rules:
   - `messageId: "unsafeFix"` with stable prefix `[unsafe-fix:<reasonCode>]`.
2. Required reason fields for every unsafe report:
   - `reasonCode` (machine-stable short code).
   - `reason` (human-readable).
3. Rule option convention for CI control:
   - `reportUnsafe` (default `true`).
   - If `false`, rule skips unsafe reports entirely (useful for “fail only fixable findings” workflows).
4. Severity never changes per message; severity remains rule-level (`off|warn|error`).
5. `unsafeFix` and `missingProjectContext` are distinct diagnostics and must not be conflated.

## Unsafe Reason Code Policy (Pinned)
1. `reasonCode` namespace is global and semver-public for lint consumers.
2. `reasonCode` format is uppercase snake case (`[A-Z0-9_]+`).
3. Registry source of truth is a checked-in typed map in lint workspace code (`src/lint/src/rules/reason-codes.ts`).
4. Changing/removing existing reason codes is semver-major; adding new reason codes is semver-minor.
5. Minimum starter reason-code set:
   - `MISSING_PROJECT_CONTEXT`
   - `NAME_COLLISION`
   - `CROSS_FILE_CONFLICT`
   - `SEMANTIC_AMBIGUITY`
   - `NON_IDEMPOTENT_EXPRESSION`
6. Rule metadata declaration field is pinned:
   - `meta.docs.gml.unsafeReasonCodes: ReadonlyArray<UnsafeReasonCode>`
7. Reason codes are reusable across rules from the same global namespace; docs/tests must validate each rule’s declared set against observed emissions.
8. `MISSING_PROJECT_CONTEXT` emission policy:
   - in this migration, `MISSING_PROJECT_CONTEXT` is reserved in the global registry and is not emitted via `unsafeFix`.
   - missing-context situations emit `messageId: "missingProjectContext"` only, consistent with the mutual-exclusivity contract.

## Lint Fixer Edit Boundary (Pinned)
1. Fixers are single-file only and must not perform cross-file writes.
2. Fixers must preserve file encoding/BOM and existing dominant line-ending style.
   - dominant line ending is determined by majority count of existing newline sequences in the original file (`\\n` vs `\\r\\n`).
   - ties/default with no newline content fall back to `\\n`.
3. Fixers may not reorder unrelated top-level statements, directives, or regions unless that specific rule contract explicitly permits it.
4. Fixers may introduce/remove text only within the current file and only for the rule’s documented transformation scope.
5. Insertion/removal of declarations near file top (for example loop-hoist locals) is allowed only when explicitly defined by that rule’s contract and safety checks.

## Rule Migration Matrix with Concrete Schemas
1. `gml/prefer-loop-length-hoist`  
   Schema: `{"type":"object","additionalProperties":false,"properties":{"functionSuffixes":{"type":"object","additionalProperties":{"anyOf":[{"type":"string","minLength":1},{"type":"null"}]}}, "reportUnsafe":{"type":"boolean","default":true}}}`  
   Replaces: `optimizeLoopLengthHoisting`, `loopLengthHoistFunctionSuffixes`.
   `functionSuffixes` semantics:
   - missing key: use built-in suffix default
   - string value: override suffix for that function
   - `null` value: disable hoist variable generation for that function
2. `gml/prefer-hoistable-loop-accessors`  
   Schema: `{"type":"object","additionalProperties":false,"properties":{"minOccurrences":{"type":"integer","minimum":2,"default":2},"reportUnsafe":{"type":"boolean","default":true}}}`  
   Behavior: detect/suggest only; no autofix.
   `reportUnsafe` semantics:
   - controls whether the rule emits “not safely hoistable” diagnostics for candidate loops
   - this rule does not emit fix operations
3. `gml/prefer-struct-literal-assignments`  
   Schema: `{"type":"object","additionalProperties":false,"properties":{"reportUnsafe":{"type":"boolean","default":true}}}`  
   Replaces: `condenseStructAssignments`.
4. `gml/optimize-logical-flow`  
   Schema: `{"type":"object","additionalProperties":false,"properties":{"maxBooleanVariables":{"type":"integer","minimum":1,"maximum":10,"default":10}}}`  
   Replaces: `optimizeLogicalExpressions`.
5. `gml/no-globalvar`  
   Schema: `{"type":"object","additionalProperties":false,"properties":{"enableAutofix":{"type":"boolean","default":true},"reportUnsafe":{"type":"boolean","default":true}}}`  
   Replaces: `preserveGlobalVarStatements`.
6. `gml/normalize-doc-comments`  
   Schema: `{"type":"object","additionalProperties":false,"properties":{}}`  
   Replaces: `normalizeDocComments`.
7. `gml/prefer-string-interpolation`  
   Schema: `{"type":"object","additionalProperties":false,"properties":{"reportUnsafe":{"type":"boolean","default":true}}}`  
   Replaces: `useStringInterpolation`.
8. `gml/optimize-math-expressions`  
   Schema: `{"type":"object","additionalProperties":false,"properties":{}}`  
   Replaces: `optimizeMathExpressions`.
9. `gml/require-argument-separators`  
   Schema: `{"type":"object","additionalProperties":false,"properties":{"repair":{"type":"boolean","default":true}}}`  
   Replaces: `sanitizeMissingArgumentSeparators`.
10. Feather extraction model:
    - Rule naming pattern is `feather/gm####`.
    - Initial explicit parity set equals IDs currently implemented in `apply-feather-fixes`.
    - Authoritative parity IDs:
      ```text
      GM1000 GM1002 GM1003 GM1004 GM1005 GM1007 GM1008 GM1009 GM1010 GM1012 GM1013 GM1014 GM1015 GM1016 GM1017 GM1021 GM1023 GM1024 GM1026 GM1028 GM1029 GM1030 GM1032 GM1033 GM1034 GM1036 GM1038 GM1041 GM1051 GM1052 GM1054 GM1056 GM1058 GM1059 GM1062 GM1063 GM1064 GM1100 GM2000 GM2003 GM2004 GM2005 GM2007 GM2008 GM2009 GM2011 GM2012 GM2015 GM2020 GM2023 GM2025 GM2026 GM2028 GM2029 GM2030 GM2031 GM2032 GM2033 GM2035 GM2040 GM2042 GM2043 GM2044 GM2046 GM2048 GM2050 GM2051 GM2052 GM2053 GM2054 GM2056 GM2061 GM2064
      ```

## Rule Behavioral Contracts (Pinned)
1. `gml/prefer-loop-length-hoist`:
   - trigger: loop-condition/accessor expressions matching the rule’s explicit callable allowlist.
   - callable allowlist ownership: `DEFAULT_HOIST_ACCESSORS` constant in rule source, then overridden/extended by `functionSuffixes` option keys.
   - eligibility preconditions: same accessor call appears in loop test on each iteration and hoist target can be declared in the loop’s containing lexical scope.
   - messageIds: `preferLoopLengthHoist`, `unsafeFix`, `missingProjectContext`.
   - fix canonical form: insert a single `var <name> = <accessorCall>;` immediately before the loop statement in the containing block/program, then replace loop-test call sites with `<name>`.
   - unsafe conditions: name collision, non-block insertion context requiring brace synthesis, or cross-file symbol conflict evidence.
   - scope insertion rule: fixer must not synthesize new braces/blocks; if loop statement is not directly insertable in an existing `Program`/`BlockStatement` statement list, report unsafe.
   - insertion examples:
     - safe: loop statement is already an item in a `Program`/`BlockStatement` list (declaration can be inserted immediately before it).
     - unsafe: loop appears as a bare single-statement child (for example directly under `if` without braces) where insertion would require block synthesis.
   - required capabilities: `IDENTIFIER_OCCUPANCY`, `LOOP_HOIST_NAME_RESOLUTION`.
2. `gml/prefer-hoistable-loop-accessors`:
   - trigger: repeated loop accessor patterns meeting `minOccurrences`.
   - eligibility preconditions: repeated accessor expressions are syntactically comparable within one loop.
   - messageIds: `preferHoistableLoopAccessor`, `notHoistable`.
   - fix shape: none (detect/suggest only).
   - unsafe conditions: none (rule does not emit fixes).
   - required capabilities: none.
3. `gml/prefer-struct-literal-assignments`:
   - trigger: consecutive compatible member assignments to the same struct target.
   - eligibility preconditions: assignment cluster is contiguous, target base is stable, and rewrite preserves original assignment order/side effects.
   - messageIds: `preferStructLiteralAssignments`, `unsafeFix`, `missingProjectContext`.
   - fix canonical form: rewrite assignment cluster to a single `target = { memberA: exprA, memberB: exprB, ... };` assignment in the same block.
   - eligible assignment pattern: contiguous `target.<member> = <expr>;` statements with stable `target` base and no interleaved control-flow/side-effecting writes.
   - conservative stability rule: target base must be a plain identifier; non-identifier bases (for example indexed/member-computed bases like `arr[i]`) are always treated as unsafe in this migration.
   - unsafe conditions: potential target aliasing, conflicting writes between assignments, or rename/conflict-plan uncertainty.
   - required capabilities: `IDENTIFIER_OCCURRENCES`, `RENAME_CONFLICT_PLANNING`.
4. `gml/optimize-logical-flow`:
   - trigger: reducible boolean-control expression patterns bounded by `maxBooleanVariables`.
   - eligibility preconditions: rewrite is algebraically equivalent under local expression semantics and does not alter short-circuit order.
   - messageIds: `optimizeLogicalFlow`.
   - fix canonical form: local expression simplification in place.
   - unsafe conditions: none (no project-aware safety gates).
5. `gml/no-globalvar`:
   - trigger: `globalvar` declarations/usages.
   - eligibility preconditions: declaration/usage can be mapped to `global.<identifier>` without local-scope ambiguity, including comma-declaration forms (`globalvar a, b;`) when grammar supports them.
   - messageIds: `noGlobalvar`, `unsafeFix`, `missingProjectContext`.
   - fix canonical form: remove `globalvar` declaration statement and rewrite symbol reads/writes to `global.<name>` in the same file.
   - rewrite-scope exclusions (never rewritten; AST-position based):
     - macro identifiers: `GmlMacroDeclaration.name`.
     - `#define` names: `GmlDirectiveStatement` with `directiveKind === "define"` via `defineName`/`defineNameRange`.
     - enum members: `GmlEnumMember.name`.
     - struct field names: `MemberExpression.property` when `computed === false` in member-access positions.
     - struct-literal property keys: object/struct literal property-key nodes.
   - declaration-removal rule: remove a `globalvar` statement only when all declared names in that statement are rewritten in the same fix; otherwise report unsafe.
   - unsafe conditions: shadowing, `with`-scope ambiguity, or conflict evidence from project analysis.
   - `with` handling rule: usages inside `with (...) { ... }` are treated as unsafe and are not autofixed.
   - required capabilities: `IDENTIFIER_OCCUPANCY`, `RENAME_CONFLICT_PLANNING`.
6. `gml/normalize-doc-comments`:
   - trigger: non-canonical documentation comment content.
   - eligibility preconditions: comment token classified as doc comment.
   - messageIds: `normalizeDocComments`.
   - fix canonical form: in-place normalization of doc-comment content only.
7. `gml/prefer-string-interpolation`:
   - trigger: string concatenation patterns convertible to interpolation.
   - eligibility preconditions: concatenation chain is interpolation-safe and preserves evaluation order.
   - messageIds: `preferStringInterpolation`, `unsafeFix`, `missingProjectContext`.
   - fix canonical form: replace eligible concatenation chain with one template/interpolated string expression.
   - unsafe conditions: non-idempotent expressions, ambiguous coercion/ordering semantics, or missing occurrence/collision confidence.
   - reason-code mapping examples:
     - side-effecting call/member access in concatenation chain -> `NON_IDEMPOTENT_EXPRESSION`
     - ambiguous numeric/string coercion ordering -> `SEMANTIC_AMBIGUITY`
   - non-idempotent heuristic (minimum conservative set): treat `CallExpression`, `UpdateExpression`, `AssignmentExpression`, and member access on non-identifier bases as non-idempotent for autofix safety.
   - required capabilities: `IDENTIFIER_OCCURRENCES`.
8. `gml/optimize-math-expressions`:
   - trigger: locally simplifiable arithmetic/identity patterns.
   - eligibility preconditions: local simplification equivalence is provable from expression syntax alone.
   - messageIds: `optimizeMathExpressions`.
   - fix canonical form: local arithmetic expression simplification in place.
9. `gml/require-argument-separators`:
   - trigger: missing-separator recovery entries from `parserServices.gml.recovery`.
   - eligibility preconditions: recovery entry `kind === "inserted-argument-separator"` and valid projected offset.
   - messageIds: `requireArgumentSeparators`.
   - fix canonical form: insert bare comma characters (`,`) at recorded original-source UTF-16 offsets (no trailing spaces; spacing is formatter-owned).
   - insertion ordering/tie-break: sort entries by `(offset ASC, argumentIndex ASC)` for identity/dedup, collapse duplicates for the same `(callRange, argumentIndex, offset)`, then apply text edits in `offset DESC` order to avoid offset-shift compensation.
10. Rule-level safety requirements:
    - any rule emitting `unsafeFix` must declare its reason-code set in metadata and docs.
    - project-aware rules must declare required capabilities in metadata; missing capabilities route to `missingProjectContext`.
11. Metadata field locations (pinned):
    - `meta.docs.gml.requiredCapabilities: ReadonlyArray<ProjectCapability>`
    - `meta.docs.gml.unsafeReasonCodes: ReadonlyArray<UnsafeReasonCode>`
12. Minimum rule->reason-code mapping:
    - `gml/prefer-loop-length-hoist`: `NAME_COLLISION`, `CROSS_FILE_CONFLICT`, `SEMANTIC_AMBIGUITY`
    - `gml/prefer-struct-literal-assignments`: `SEMANTIC_AMBIGUITY`, `CROSS_FILE_CONFLICT`
    - `gml/no-globalvar`: `NAME_COLLISION`, `SEMANTIC_AMBIGUITY`, `CROSS_FILE_CONFLICT`
    - `gml/prefer-string-interpolation`: `NON_IDEMPOTENT_EXPRESSION`, `SEMANTIC_AMBIGUITY`

## Feather Parity Manifest Contract (Pinned)
1. Parity is defined by manifest data, not only by ID presence.
2. A manifest entry exists for every parity ID with:
   - `id` (for example `GM1051`)
   - `ruleId` (for example `feather/gm1051`)
   - `defaultSeverity` (`warn` or `error`)
   - `fixability` (`none` | `safe-only` | `always`)
   - `requiresProjectContext` (`boolean`)
   - `fixScope` (`local-only`)
   - `messageIds` (stable IDs for diagnostics/suggestions)
3. `unsafeFix` remains the shared message ID for project-safety failures, including Feather rules when relevant.
4. Phase 5 parity completion requires all IDs to have manifest entries with deterministic severity/fixability/messageId definitions.
5. Identifier casing/mapping is pinned:
   - manifest diagnostic ID is uppercase `GM####`
   - ESLint rule ID is lowercase `feather/gm####`
   - mapping is deterministic and zero-padding-preserving.
6. `fixScope` currently has only `local-only` due to global no-cross-file-write policy; field is retained to allow future extension without schema break.
7. Manifest location and format:
   - canonical manifest source lives in lint workspace code (`src/lint/src/rules/feather/manifest.ts`).
   - manifest is a checked-in typed data object (not runtime-synthesized).
8. Manifest versioning:
   - manifest includes explicit `schemaVersion`.
   - schema changes are semver-major for `@gml-modules/lint`.
9. `messageIds` policy:
   - message IDs are stable per rule and defined per-manifest entry.
   - shared IDs (for example `unsafeFix`) are explicitly listed where reused.

## Clear Division Between Adjacent Loop Rules
1. `gml/prefer-hoistable-loop-accessors` only detects/suggests repeated accessor patterns.
2. `gml/prefer-loop-length-hoist` is the only rule that applies hoist fixes.
3. Shared suppression marker prevents double-reporting on the same loop node when both rules are enabled.
4. No deprecation between these two rules in this migration.

## Testing and Delivery
Verification coverage and regression protections for the direct end-state migration.

## Direct End-State Fixture/Test Ownership (Pinned)
1. This migration targets the final ownership model directly, with no phased legacy bridge for formatter semantic rewrites.
2. Formatter/plugin ownership is layout-only tests and fixtures.
3. Lint ownership is all semantic/content rewrite tests and fixtures (including feather parity fixtures).
4. Mixed legacy formatter fixtures must be split into:
   - formatter-only layout fixtures in `src/plugin/test/fixtures/formatting`
   - lint rule fixtures in `src/lint/test/fixtures/<rule>`
   - migrated Feather `testGM*` fixtures normalized under `src/lint/test/fixtures/feather/gm####/`
5. The exhaustive per-file and per-basename ownership ledger lives in `docs/formatter-linter-split-implementation-notes.md` under **Formatter-Only Ownership Ledger (2026-02-15, Exhaustive)** and is normative for migration execution.

## Fixtures and Testing Strategy
1. New lint fixtures live only under `src/lint/test/fixtures`.
   - migrated legacy Feather fixture inventory lives under `src/lint/test/fixtures/feather/gm####/` (plus `gm####-attachment` variants where needed).
2. Parser and parser-input golden `.gml` fixtures remain immutable.
3. Legacy plugin formatter semantic fixtures are migration inventory, not end-state formatter goldens; they are moved or split per the ownership ledger.
4. Required test groups:
   - ESLint language contract tests (keys, parser wiring, loc/range/token/comment invariants, UTF-16 offset behavior).
   - Parse failure/recovery tests (fatal parse, recovered separators).
   - Rule detection/fix tests for each migrated rule and each feather parity ID.
   - Unsafe-fix reporting tests with `reportUnsafe: true|false`.
   - CLI integration tests for config search, `--config`, `--project`, ignore behavior, formatter output, and exit codes.
   - Config discovery tests covering candidate filename order, searched-location reporting, multiple-config same-directory selection behavior, cwd-origin discovery for outside-cwd targets, fallback gating, and `--config` missing/invalid => exit `2`.
   - Path-normalization tests: runtime path surfaces use platform-native separators, no trailing separators except canonical root forms (including UNC share roots), and snapshot assertions normalize separators before comparison.
   - Symlink canonicalization test: when ESLint supplies a symlink path, `parserServices.gml.filePath` canonicalizes to realpath (or documented fallback), and project-context lookups continue to function via canonical path usage.
   - Root-resolution tests covering realpath normalization, symlink handling, and per-target nearest-ancestor `.yyp` resolution.
   - Forced-root boundary test: canonical path boundary checks treat `/root2/...` as out-of-root for forced root `/root`.
   - Forced-root Windows boundary test:
     - forced root `C:\\root`, file `C:\\root2\\file.gml` => out-of-root.
     - forced root `C:\\root`, file `C:\\root\\sub\\file.gml` => in-root.
   - Forced-root UNC boundary test:
     - forced root `\\\\server\\share\\root\\`, file `\\\\server\\share\\root2\\file.gml` => out-of-root.
     - forced root `\\\\server\\share\\root\\`, file `\\\\server\\share\\root\\sub\\file.gml` => in-root.
   - Project-analysis degradation tests for missing/partial semantic-refactor outputs => `missingProjectContext` behavior (no unsafe permissive fixes).
   - Regression tests proving formatter no longer applies migrated semantic transforms.
   - Dependency policy tests updated to include `@gml-modules/lint` and enforce no Prettier dependency in lint workspace.
   - Missing-context consistency tests (per **Rule Access to Language Services (Pinned)**): every project-aware rule emits `missingProjectContext` (once per file per rule), with no fixes, when project settings are absent, malformed, or return `null`.
   - Capability-gating tests: project-aware rules with unavailable required capabilities emit `missingProjectContext` and perform no fix.
   - Rule-metadata capability tests: every project-aware rule declares `meta.docs.gml.requiredCapabilities`, and local-only rules omit it.
   - Unsafe reason-code tests: every `unsafeFix` emission reason code is declared in `meta.docs.gml.unsafeReasonCodes` and present in global reason-code registry.
   - Missing-context/unsafe exclusivity tests: for the same file/rule execution path, `missingProjectContext` and `unsafeFix` are never both emitted.
   - Reserved reason-code test: `MISSING_PROJECT_CONTEXT` is not emitted via `unsafeFix` in this migration.
   - Separator-fix payload test: `gml/require-argument-separators` inserts bare `,` only (no trailing whitespace).
   - Struct-literal stability test: non-identifier assignment bases are treated as unsafe in this migration.
   - `no-globalvar` rewrite-scope test: macro identifiers, enum members, struct field names, `#define` names (`defineName`/`defineNameRange`), and struct-literal property keys are never rewritten, validated by AST node position/category (not token-text matching).
   - Project-aware marker enforcement test: rules with `meta.docs.requiresProjectContext !== true` must not access `context.settings.gml.project` at all (validated with a sentinel project settings object that throws on any access).
   - Monotonicity tests for indexing: `--index-allow` may enable safe fixes with new evidence and must not cause safe->unsafe without a real discovered conflict.
   - Selector traversal tests for all extension node types.
   - Fallback non-duplication test: when no user config exists and fallback applies, a pinned fixture yields an exact expected finding count and plugin/language registration occurs once (no duplicate rule execution).
   - Overlay interaction tests:
     - `recommended + feather` applies feather diagnostics without duplicating language/plugin wiring behavior.
     - `recommended + performance` reduces findings for pinned expensive-rule fixtures according to the appendix baseline.
     - `recommended + feather + performance` preserves feather defaults while applying performance overrides to listed `gml/*` rules only.
   - Overlay wiring UX test: using per-file `ESLint#calculateConfigForFile(filePath)` resolution, `GML_OVERLAY_WITHOUT_LANGUAGE_WIRING` emits only when rules applied at non-off severity include `feather/*` or IDs in `PERFORMANCE_OVERRIDE_RULE_IDS`, and resolved wiring lacks either `plugins.gml === Lint.plugin` (reference identity) or `language: "gml/gml"` for that file.
   - Overlay configured-but-not-applied test: if overlay rules are present in project config but do not apply to the linted `.gml` file’s resolved config, `GML_OVERLAY_WITHOUT_LANGUAGE_WIRING` is not emitted.
   - Overlay partial-wiring mismatch tests:
     - `plugins.gml === Lint.plugin` present but `language !== "gml/gml"` for the resolved `.gml` file => emits `GML_OVERLAY_WITHOUT_LANGUAGE_WIRING`.
     - `language === "gml/gml"` present but `plugins.gml !== Lint.plugin` for the resolved `.gml` file => emits `GML_OVERLAY_WITHOUT_LANGUAGE_WIRING`.

## End-State Exit Criteria
1. Plugin formatter runtime does not execute semantic/content rewrites.
2. Plugin formatter tests/fixtures contain only layout/rendering expectations.
3. Lint workspace owns semantic/content rewrite diagnostics and autofixes (including feather parity corpus).
4. All mixed legacy fixtures are either moved to lint or split into explicit plugin+lint ownership artifacts.
5. CLI `lint --fix` + formatter pipeline preserves the same final formatted style while making ownership boundaries explicit.

## Finalized Migration Mapping (Durable Contract)

| Legacy formatter behavior | Final owner | Migration path |
| --- | --- | --- |
| `preserveGlobalVarStatements: false` rewrite path | `@gml-modules/lint` (`gml/no-globalvar`) | Run `lint --fix` before formatter. |
| Loop accessor hoisting rewrites | `@gml-modules/lint` (`gml/prefer-loop-length-hoist`) | Enable recommended config and `--fix`. |
| Missing argument separator repairs | `@gml-modules/lint` (`gml/require-argument-separators`) | Run lint autofix; formatter will not repair syntax. |
| Comment content normalization | `@gml-modules/lint` (`gml/normalize-doc-comments`) | Keep formatter text-preserving for comments. |
| Whitespace, wrapping, indentation, canonical operator style rendering | `@gml-modules/plugin` | Continue using formatter-only flow. |

### Required before/after examples

#### Missing separators (lint owns syntax repair)

Before:

```gml
show_debug_message(player_name player_score);
```

After (`gml/require-argument-separators --fix`):

```gml
show_debug_message(player_name, player_score);
```

#### Formatter-only canonicalization (no semantic rewrite)

Before:

```gml
if (can_jump && is_grounded) {
show_debug_message("jump");
}
```

After (formatter):

```gml
if (can_jump and is_grounded) {
    show_debug_message("jump");
}
```

### Auto-generated project-aware rule list

The published list now lives at [`docs/generated/project-aware-rules.md`](./generated/project-aware-rules.md) and is generated from `meta.docs.requiresProjectContext` via:

```bash
pnpm run generate:lint-rule-docs
```
