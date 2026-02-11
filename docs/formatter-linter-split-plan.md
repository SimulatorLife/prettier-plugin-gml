# Formatter/Linter Split Plan

## Summary
1. Split responsibilities into a formatter-only workspace and an ESLint v9 language+rules workspace.
2. Lock exact ESLint language wiring, AST/token/comment/range contracts, parse-error behavior, project-context lifecycle, rule schemas, CLI semantics, and migration scope.
3. Keep formatter deterministic and non-semantic; move all non-layout rewrites to lint rules with explicit diagnostics and optional `--fix`.

## Public API and Workspace Changes
1. Add new workspace at `/Users/henrykirk/gamemaker-language-parser/src/lint` with package name `@gml-modules/lint`.
2. Keep `/Users/henrykirk/gamemaker-language-parser/src/plugin` as formatter-only (`@gml-modules/plugin`).
3. Add lint command implementation in `/Users/henrykirk/gamemaker-language-parser/src/cli/src/commands/lint.ts`.
4. Root namespace export for lint package:
   ```ts
   // /Users/henrykirk/gamemaker-language-parser/src/lint/index.ts
   export { Lint } from "./src/index.js";
   ```
5. Lint namespace export surface:
   ```ts
   // /Users/henrykirk/gamemaker-language-parser/src/lint/src/index.ts
   export const Lint = Object.freeze({
     plugin,      // ESLint plugin object (rules + languages + configs)
     configs,     // recommended / feather / performance
     ruleIds,     // frozen map of canonical rule IDs
     services     // project-context factories + helpers
   });
   ```

## ESLint v9 Language Wiring Contract (Pinned)
1. `Lint.plugin` is the object registered under `plugins.gml`.
2. `Lint.plugin.languages.gml` is the ESLint v9 language object used via `language: "gml/gml"`.
3. This migration implements a **language plugin**, not `languageOptions.parser`.
4. Supported keys in `.gml` flat-config blocks are `files`, `ignores`, `plugins`, `language`, `languageOptions`, `rules`, `linterOptions`.
5. Unsupported for `.gml` blocks are `languageOptions.parser`, `languageOptions.parserOptions`, and `processor`; `validateLanguageOptions()` throws on these.
6. Minimal real config:
   ```ts
   import { Lint } from "@gml-modules/lint";

   export default [
     ...Lint.configs.recommended,
     {
       files: ["**/*.gml"],
       plugins: { gml: Lint.plugin },
       language: "gml/gml",
       languageOptions: { recovery: "limited" },
       rules: {
         "gml/prefer-loop-length-hoist": ["warn", { functionSuffixes: { array_length: "len" } }],
         "gml/no-globalvar": "error",
         "feather/gm1051": "error"
       }
     }
   ];
   ```

## ESLint v9 Language Object Interface (Pinned)
1. `Lint.plugin.languages.gml` implements the ESLint v9 `Language` interface exactly as documented by ESLint/@eslint-core for the pinned major version.
2. Method names and method signatures are not independently redefined in this plan; they follow ESLint’s language contract for v9.
3. Pinned GML language behavior on top of that interface:
   - `fileType: "text"`
   - `lineStart: 1`
   - `columnStart: 0`
   - `nodeTypeKey: "type"`
   - `defaultLanguageOptions: { recovery: "limited" }`
   - `visitorKeys: GML_VISITOR_KEYS`
4. Language options contract:
   ```ts
   type GmlLanguageOptions = Readonly<{
     recovery: "none" | "limited";
   }>;
   ```
5. Parse failure contract:
   - Parse failures are returned through ESLint language parse error results (`ok: false` + `errors[]`), not thrown as uncaught exceptions.
6. SourceCode contract:
   - Implementation uses ESLint `SourceCode` (no custom SourceCode class), so `getText()`, token APIs, comment APIs, and location helpers behave per ESLint defaults.
7. Scope analysis contract:
   - No custom scope manager is provided by the language object in this migration.
   - Rules requiring project-wide analysis use `Lint.services` (project context), not ESLint scope-manager extensions.
8. `parserServices` contract:
   - `parserServices.gml` is always present on successful parse with language-specific metadata required by GML rules.
   - Recovery metadata (for example inserted separator locations) is exposed via `parserServices.gml.recovery`.
9. Conformance tests are required:
   - Type-level conformance against installed ESLint v9 language typings.
   - Runtime contract tests that verify method presence/behavior on the actual language object.

## Rule Access to Language Services (Pinned)
1. Rules access language-specific metadata through `context.sourceCode.parserServices.gml`.
2. Rules must not infer parse/recovery metadata from `context.languageOptions`; `languageOptions` is configuration input, not parse output.
3. Project-aware data access is via `Lint.services` helpers injected into rule execution context.

## Language Options Validation UX (Pinned)
1. Validation uses the effective file-level language options provided by ESLint for that file; the CLI does not re-implement flat-config merge logic.
2. `validateLanguageOptions()` is the canonical validation hook.
3. Unsupported keys (`languageOptions.parser`, `languageOptions.parserOptions`, `processor`) fail fast with a stable error code: `GML_LANGUAGE_OPTIONS_UNSUPPORTED_KEY`.
4. Validation errors include:
   - offending key path
   - allowed keys
   - actionable hint to use `language: "gml/gml"` and plugin rules instead
5. Any validation failure is treated as a runtime/config failure and maps to CLI exit code `2`.

## AST/Token/Comment Contract (Pinned)
1. Output model is ESTree-compatible plus explicit GML extension node types.
2. `range` is always `[start, end)` in UTF-16 code-unit offsets.
3. `loc` is always `line: 1-based`, `column: 0-based`.
4. `Program.comments` and `Program.tokens` are always present for `.gml` linting.
5. GML-to-ESTree mapping rules:
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
6. Custom visitor keys are shipped for every extension node.

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

## Recovery Index Projection Contract (Pinned)
1. Limited recovery may parse against a virtual patched representation of the file (for missing separators only).
2. A monotonic offset-projection map from virtual offsets back to original-source offsets is required.
3. All emitted AST `loc`/`range` and token `loc`/`range` are projected to original-source coordinates.
4. Inserted separators are recorded in `parserServices.gml.recovery` using original-source insertion coordinates.
5. `gml/require-argument-separators` consumes recovery metadata for diagnostics/fixes; other rules observe original-source indexing only.

## Extension Node Placement and Traversal (Pinned)
1. Extension nodes (`GmlMacroDeclaration`, `GmlDirectiveStatement`, `GmlMissingArgument`, `GmlEnumDeclaration`, `GmlEnumMember`) are first-class AST nodes and may appear in `Program.body` and nested statement lists where syntactically valid.
2. All extension nodes are traversable through `visitorKeys` and selector-based rule traversal; they are not hidden side channels.
3. Rule authoring contract:
   - Rules may report on extension nodes.
   - Rules may autofix extension-node findings only with local single-file edits.
   - Rules must not rely on extension nodes being absent when linting mixed syntax files.

## Parse Errors and Recovery Contract (Pinned)
1. Language parse never throws uncaught exceptions to ESLint.
2. `languageOptions.recovery` options:
   - `"none"`: strict parse only.
   - `"limited"` (default): run only missing-argument-separator recovery before parse.
3. If strict/limited parse fails, language returns `ok: false` with `errors[]`; ESLint emits fatal diagnostics (`ruleId: null`, severity error, message prefixed `Parsing error:`).
4. Fatal parse diagnostics are not rule-configurable (ESLint standard behavior).
5. Recovered separators are reported by `gml/require-argument-separators` with configurable severity and autofix.
6. Lint continues across other files even when some files have fatal parse errors.

## Project Root, Indexing, and Cache Lifecycle (Pinned)
1. CLI adds `--project <path>` as explicit project-root override.
2. Without `--project`, root resolution is nearest ancestor containing a GameMaker manifest (`.yyp`) from each linted file path; fallback is CLI `cwd`.
3. Runtime owns one invocation-scoped `ProjectLintContextRegistry` keyed by resolved root.
4. Each context indexes `.gml` sources under root once, using semantic/refactor-backed analysis data, with hard excludes: `.git`, `node_modules`, `dist`, `generated`, `vendor`.
5. Context is immutable for the lint invocation.
6. Under `--fix`, project-aware decisions use pre-fix snapshot state for all passes in that invocation.
7. No cross-file writes are allowed by any rule fixer.
8. Hard excludes are absolute and cannot be re-included by user flat-config globs.
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

## `--fix` Pass and Snapshot Semantics (Pinned)
1. CLI executes one ESLint invocation with `fix: true` when `--fix` is requested.
2. ESLint may apply its internal fix passes, but the project-aware context remains the original pre-fix filesystem snapshot for the full invocation.
3. Project-aware services never re-read modified file contents produced by current-run fixes.
4. No additional outer “stabilization rerun” is performed by the CLI in this migration.

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
6. `fixScope` currently has only `local-only` due global no-cross-file-write policy; field is retained to allow future extension without schema break.

## Clear Division Between Adjacent Loop Rules
1. `gml/prefer-hoistable-loop-accessors` only detects/suggests repeated accessor patterns.
2. `gml/prefer-loop-length-hoist` is the only rule that applies hoist fixes.
3. Shared suppression marker prevents double-reporting on the same loop node when both rules are enabled.
4. No deprecation between these two rules in this migration.

## CLI Loading, Discovery, Merging, and Output (Pinned)
1. `lint <paths...>` delegates file enumeration to ESLint `lintFiles()`.
2. If `--config` is provided, CLI sets `overrideConfigFile` to that path.
3. If `--config` is absent, CLI uses ESLint default flat-config discovery.
4. If no user config is found, CLI falls back to bundled `Lint.configs.recommended`.
   - this is an explicit policy choice, not implicit ESLint behavior.
   - fallback can be disabled via `--no-default-config`.
   - docs must list exact rules active in fallback mode.
5. `ignores` are flat-config-driven; `.eslintignore` is not used.
6. Supported formatter values are `stylish`, `json`, `checkstyle`, all via `ESLint.loadFormatter()`.
7. `checkstyle` requires `eslint-formatter-checkstyle` at runtime.
8. Exit codes:
   - `0`: no errors and warnings within threshold.
   - `1`: lint errors exist or `--max-warnings` exceeded.
   - `2`: config/runtime/formatter loading failures.

## Formatter Boundary (Pinned)
1. Formatter may only perform layout and canonical rendering transforms.
2. Formatter must not perform semantic/content rewrites or syntax repair.
3. `logicalOperatorsStyle` remains formatter-only and is limited to canonical alias rendering of equivalent logical operators.
4. `normalizeDocComments` moves to lint because it mutates comment text content.
5. Invalid code handling:
   - Formatter parses strictly.
   - On parse failure, formatter fails and does not mutate source.
   - Syntax repairs are lint-only (`lint --fix`).

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

## Fixtures and Testing Strategy
1. New lint fixtures live only under `/Users/henrykirk/gamemaker-language-parser/src/lint/test/fixtures`.
2. No modifications to parser/plugin golden `.gml` fixtures.
3. Required test groups:
   - ESLint language contract tests (keys, parser wiring, loc/range/token/comment invariants, UTF-16 offset behavior).
   - Parse failure/recovery tests (fatal parse, recovered separators).
   - Rule detection/fix tests for each migrated rule and each feather parity ID.
   - Unsafe-fix reporting tests with `reportUnsafe: true|false`.
   - CLI integration tests for config search, `--config`, `--project`, ignore behavior, formatter output, and exit codes.
   - Regression tests proving formatter no longer applies migrated semantic transforms.
   - Dependency policy tests updated to include `@gml-modules/lint` and enforce no Prettier dependency in lint workspace.

## Implementation Phases and Exit Criteria
1. Phase 1: Scaffold `/src/lint` workspace and namespace exports.  
   Exit: build/test pass with a no-op rule and language stub.
2. Phase 2: Implement ESLint v9 language object and ESTree bridge contract.  
   Exit: `.gml` file lints successfully with real tokens/comments/ranges.
3. Phase 3: Implement invocation-scoped `ProjectLintContextRegistry`.  
   Exit: one project-aware rule can resolve name-occupancy synchronously from immutable context.
4. Phase 4: Migrate formatter options to lint rules with schemas and docs.  
   Exit: all matrix entries implemented; schemas validated; parity tests pass.
5. Phase 5: Feather split via `feather/gm####` rules and parity manifest.  
   Exit: parity ID set above has deterministic mapping, default severity, and fixability status.
6. Phase 6: Formatter cleanup and runtime-port removal from plugin semantic/refactor paths.  
   Exit: plugin no longer depends on semantic/refactor runtime hooks for migrated behavior.
7. Phase 7: CLI lint command integration and reporting semantics.  
   Exit: end-to-end `lint` and `lint --fix` pass integration suite.
8. Phase 8: Migration docs and release notes update in `/Users/henrykirk/gamemaker-language-parser/docs/formatter-linter-split-plan.md` and package READMEs.  
   Exit: old option-to-rule migration table includes concrete schemas and before/after examples.

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

## Assumptions and Defaults
1. Node runtime baseline remains `>=22.0.0` across workspaces.
2. ESLint major is pinned to v9 (`>=9.39.0 <10`) for lint package compatibility.
3. Project-aware context is intentionally immutable per invocation; no in-run incremental reindexing under `--fix`.
4. Formatter and linter remain separate commands and separate responsibilities.

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
