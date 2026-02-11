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
2. `gml/prefer-hoistable-loop-accessors`  
   Schema: `{"type":"object","additionalProperties":false,"properties":{"minOccurrences":{"type":"integer","minimum":2,"default":2},"reportUnsafe":{"type":"boolean","default":true}}}`  
   Behavior: detect/suggest only; no autofix.
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

## Assumptions and Defaults
1. Node runtime baseline remains `>=22.0.0` across workspaces.
2. ESLint major is pinned to v9 (`>=9.39.0 <10`) for lint package compatibility.
3. Project-aware context is intentionally immutable per invocation; no in-run incremental reindexing under `--fix`.
4. Formatter and linter remain separate commands and separate responsibilities.
