# Formatter/Linter Split Plan

## Summary
1. Split responsibilities into a formatter-only workspace and an ESLint v9 language+rules workspace.
2. Lock exact ESLint language wiring, AST/token/comment/range contracts, parse-error behavior, project-context lifecycle, rule schemas, CLI semantics, and migration scope.
3. Keep formatter deterministic and non-semantic; move all non-layout rewrites to lint rules with explicit diagnostics and optional `--fix`.

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
     plugin,      // ESLint plugin object (rules + languages + configs)
     configs,     // recommended / feather / performance
     ruleIds,     // frozen map of canonical rule IDs
     services     // project-context factories + helpers
   });
   ```
6. `Lint.ruleIds` contract:
   - `ruleIds` is a frozen, full-ID map for both `gml/*` and `feather/*` rules.
   - map values are canonical full ESLint rule IDs (for example `gml/no-globalvar`, `feather/gm1051`), not short names.
   - map keys are stable internal identifiers used for docs/config generation and tests.
7. `Lint.configs` contract:
   - `configs.recommended`, `configs.feather`, and `configs.performance` are readonly flat-config arrays (`FlatConfig[]` shape), not functions.
   - each config surface is directly consumable in `eslint.config.*` via array spread.
8. Feather manifest export contract:
   - parity manifest is exported as typed runtime data from lint workspace code (not generated ad-hoc at runtime).
   - manifest schema version is explicit (`schemaVersion`) and semver-governed.

## ESLint v9 Language Wiring Contract (Pinned)
1. `Lint.plugin` is the object registered under `plugins.gml`.
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
6. `parse(...)` return-channel contract:
   - success returns ESLint-compatible parse success payload containing AST + parser services for `createSourceCode(...)`.
   - parse failure returns through ESLint v9 parse-failure return channel (no uncaught throw).
   - exact object field names are pinned by runtime contract tests against the installed ESLint version.
   - stable wrapper intent for implementers:
     ```ts
     type GmlParseSuccess = {
       ok: true;
       ast: Program;
       parserServices: { gml: GmlParserServices };
       visitorKeys: VisitorKeys;
     };

     type GmlParseFailure = {
       ok: false;
       errors: ReadonlyArray<{
         message: string;
         line: number;
         column: number;
         endLine?: number;
         endColumn?: number;
       }>;
     };
     ```
7. Parse failure contract:
   - Parse failures are surfaced through ESLint v9’s documented language parse-failure mechanism (returned, not thrown uncaught).
8. `createSourceCode(...)` contract:
   - receives the parse result produced by `parse(...)` and returns ESLint `SourceCode`.
   - no custom `SourceCode` subclass is used in this migration.
9. SourceCode contract:
   - Implementation uses ESLint `SourceCode` (no custom SourceCode class), so `getText()`, token APIs, comment APIs, and location helpers behave per ESLint defaults.
10. Scope analysis contract:
   - No custom scope manager is provided by the language object in this migration.
   - Rules requiring project-wide analysis use `Lint.services` (project context), not ESLint scope-manager extensions.
11. `validateLanguageOptions(...)` contract:
   - language-option validation is performed in this method using effective file-level options supplied by ESLint.
   - unsupported options fail with stable error codes documented in **Language Options Validation UX (Pinned)**.
12. `parserServices` contract:
   - `parserServices.gml` is always present on successful parse with language-specific metadata required by GML rules.
   - Recovery metadata (for example inserted separator locations) is exposed via `parserServices.gml.recovery`.
13. Conformance tests are required:
   - Type-level conformance against installed ESLint v9 language typings.
   - Runtime contract tests that verify method presence/behavior on the actual language object.

## Rule Access to Language Services (Pinned)
1. Rules access language-specific metadata through `context.sourceCode.parserServices.gml`.
2. Rules must not infer parse/recovery metadata from `context.languageOptions`; `languageOptions` is configuration input, not parse output.
3. Project-aware data access is via `Lint.services` helpers injected into rule execution context.
4. Injection path is pinned: project services are exposed under `context.settings.gml.project`.
5. Injection ownership is pinned:
   - only the CLI runtime injects `context.settings.gml.project`.
   - in direct ESLint usage, `context.settings.gml.project` is absent by default unless users provide compatible custom injection.
6. Rule authors must not invent alternate service discovery paths.
7. Minimum project settings interface:
   ```ts
   type GmlProjectSettings = {
     getContext(filePath: string): ProjectContext | null;
   };
   ```
   `ProjectContext` exposes project-aware helpers such as:
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

## Parser Services Interface (Pinned)
1. Stable minimal `parserServices.gml` interface:
   ```ts
   type GmlParserServices = {
     schemaVersion: 1;
     filePath: string;
     recovery: ReadonlyArray<GmlRecoveryInsertion>;
     directives: ReadonlyArray<GmlDirectiveInfo>;
     enums: ReadonlyArray<GmlEnumInfo>;
   };
   ```
2. `GmlRecoveryInsertion` stable entry shape:
   ```ts
   type GmlRecoveryInsertion = {
     kind: "inserted-argument-separator";
     offset: number; // original-source UTF-16 offset
     loc: { line: number; column: number };
     callRange: [number, number];
     argumentIndex: number;
   };
   ```
3. `parserServices.gml` intentionally does not expose CST internals; rules consume AST + `SourceCode` + this stable metadata only.
4. Additional parser-service fields may exist internally, but rules must not rely on non-documented fields in this plan.

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

## Project Root, Indexing, and Cache Lifecycle (Pinned)
1. CLI adds `--project <path>` as explicit project-root override.
2. Without `--project`, root resolution is nearest ancestor containing a GameMaker manifest (`.yyp`) from each linted file path; fallback is CLI `cwd`.
   - root discovery resolves candidate paths through `realpath` before `.yyp` ancestry checks.
   - symlinks are normalized to canonical paths for registry keys and deduplication.
   - discovery is per concrete lint target file after ESLint file enumeration.
3. Runtime owns one invocation-scoped `ProjectLintContextRegistry` keyed by resolved root.
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
3. `ProjectContext` helper methods are thin query surfaces over this indexed data and must be deterministic for a fixed snapshot.
4. If required analysis output is missing/unsupported/partial for a file set, project-aware rules degrade to `missingProjectContext` behavior for affected files.
5. No persistent cache contract:
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

## Lint Fixer Edit Boundary (Pinned)
1. Fixers are single-file only and must not perform cross-file writes.
2. Fixers must preserve file encoding/BOM and existing dominant line-ending style.
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

## CLI Loading, Discovery, Merging, and Output (Pinned)
1. `lint <paths...>` delegates file enumeration to ESLint `lintFiles()`.
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
4. If no user config is found, CLI falls back to bundled `Lint.configs.recommended`.
   - this is an explicit policy choice, not implicit ESLint behavior.
   - fallback can be disabled via `--no-default-config`.
   - fallback message includes actionable next steps (`--no-default-config` and config file locations searched).
   - docs must list exact rules active in fallback mode.
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
1. New lint fixtures live only under `src/lint/test/fixtures`.
2. No modifications to parser/plugin golden `.gml` fixtures.
3. Required test groups:
   - ESLint language contract tests (keys, parser wiring, loc/range/token/comment invariants, UTF-16 offset behavior).
   - Parse failure/recovery tests (fatal parse, recovered separators).
   - Rule detection/fix tests for each migrated rule and each feather parity ID.
   - Unsafe-fix reporting tests with `reportUnsafe: true|false`.
   - CLI integration tests for config search, `--config`, `--project`, ignore behavior, formatter output, and exit codes.
   - Config discovery tests covering candidate filename order, searched-location reporting, fallback gating, and `--config` missing/invalid => exit `2`.
   - Root-resolution tests covering realpath normalization, symlink handling, and per-target nearest-ancestor `.yyp` resolution.
   - Project-analysis degradation tests for missing/partial semantic-refactor outputs => `missingProjectContext` behavior (no unsafe permissive fixes).
   - Regression tests proving formatter no longer applies migrated semantic transforms.
   - Dependency policy tests updated to include `@gml-modules/lint` and enforce no Prettier dependency in lint workspace.
   - Missing-context consistency tests (per **Rule Access to Language Services (Pinned)**): every project-aware rule emits `missingProjectContext` (once per file per rule), with no fixes, when project settings are absent, malformed, or return `null`.
   - Project-aware marker enforcement test: rules with `meta.docs.requiresProjectContext !== true` must not call `context.settings.gml.project.getContext()` (validated with a sentinel project settings object that throws on access).
   - Monotonicity tests for indexing: `--index-allow` may enable safe fixes with new evidence and must not cause safe->unsafe without a real discovered conflict.
   - Selector traversal tests for all extension node types.
   - Fallback non-duplication test: when no user config exists and fallback applies, a pinned fixture yields an exact expected finding count and plugin/language registration occurs once (no duplicate rule execution).

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
8. Phase 8: Migration docs and release notes update in `docs/formatter-linter-split-plan.md` and package READMEs.  
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

## Parser Services Presence Rules (Pinned)
1. On parse failure, rules do not run for that file and `parserServices.gml` is absent.
2. On successful parse without recovery edits, `parserServices.gml` is present and `parserServices.gml.recovery` exists as an empty collection.
3. On successful parse with limited recovery edits, `parserServices.gml` is present and `parserServices.gml.recovery` contains projected insertion metadata.
4. On successful parse, `Program.tokens` and `Program.comments` are arrays (possibly empty).
5. On parse failure, there is no AST/`Program`, therefore no token/comment arrays are available to rules.
