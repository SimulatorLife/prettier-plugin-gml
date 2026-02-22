# Formatter/Linter Split Plan & Implementation

## 1. Summary & Objectives
1. Split responsibilities into a formatter-only workspace (`@gml-modules/plugin`) and an ESLint v9 language+rules workspace (`@gml-modules/lint`).
2. Lock exact ESLint language wiring, AST/token/comment/range contracts, parse-error behavior, project-context lifecycle, rule schemas, CLI semantics, and migration scope.
3. Keep formatter deterministic and non-semantic; move all non-layout rewrites to lint rules with explicit diagnostics and optional `--fix`.

## 2. Handling Malformed GML (Two-Tier Workflow)

**Question:** "How should my workflow handle malformed GML? I don't want the parser or formatter to fix the issues, but I do want the lint auto-fixes to do so."

Use a two-tier workflow: format only when parse succeeds, and run lint in two phases so you can still apply “safe fixes” to malformed code.

### 1) Separate “format” from “fix”
- **Formatter (Prettier-like):** requires a valid parse; if parse fails, it should error and not change files.
- **Lint autofix:** can run even when parsing fails, but only for fixes that don’t require a full AST.

### 2) Implement lint autofix in two phases
**Phase A: Token-based / tolerant fixes (runs even on malformed code)**
Run a tokenizer (or tolerant scanner) that can classify:
- code vs strings vs comments
- basic operators / directives

Apply only local, unambiguous rewrites, e.g.:
- `&&` → `and`, `||` → `or`, `%` → `mod`
- `#define` → `#macro`
- normalize line endings / tabs → spaces (if you consider that safe)
- strip or normalize comment banners (if tokenizer can detect them)
- numeric literal normalization only if tokenizer can safely identify numeric tokens

This phase produces a new text buffer and should be idempotent.

**Phase B: AST-based lint fixes (runs only if parse succeeds)**
If Phase A results in valid syntax (or if the original was valid), then:
- parse AST
- run semantic rules and fixers (rename maps, parenthesis rules if you add them, doc comment formatting rules that depend on AST attachment, etc.)

If parse still fails, stop after Phase A and report diagnostics.

### 3) Workflow order (recommended)
**On save (editor)**
- Phase A lint-fix (token-based, tolerant)
- Try parse
- If parse succeeds: run formatter and/or Phase B lint-fix
- If parse fails: do not format; show parser error

**In CI**
- `lint --fix` (both phases, but only apply Phase B when parse succeeds per file)
- `format --check` (only on parseable files; fail on parse errors)
- tests

### 4) Surface behavior to the user
Make it obvious in output:
- “Applied safe token fixes; file still has syntax errors; formatting skipped.”
- “Formatting skipped due to parse error: …”

Do not silently change unrelated regions when the file is malformed.

### 5) Where to put the logic
- **Parser:** never fixes malformed code; either returns AST or throws.
- **Formatter:** never runs on malformed code; it should fail fast.
- **Linter:** owns “repair-like” rewrites via Phase A; owns semantic/autofixes via Phase B.

### 6) Practical rule of thumb
- If a fix can be done safely with only token context: allow it on malformed input.
- If a fix requires AST structure: require a successful parse.

This gives you the behavior you want: malformed GML is not “magically fixed” by formatting, but you still get productive auto-fixes for mechanical issues.

## 3. Ownership Boundaries

### 3.1 General Ownership
- **Formatter (`@gml-modules/plugin`)**: Layout-only printing, indentation, wrapping, spacing, semicolon layout, print-width wrapping, logical operator style rendering. Must not synthesize or normalize content.
- **Linter (`@gml-modules/lint`)**: Semantic/content rewrites, synthetic tag generation, legacy prefix/tag normalization, project-aware diagnostics and autofix rewrites.
- **Refactor (`@gml-modules/refactor`)**: Explicit rename/refactor transactions (cross-file edits, metadata edits, impact analysis, hot-reload validation).
- **Core (`@gml-modules/core`)**: Shared doc-comment helpers, AST metadata utilities, and normalization primitives.

### 3.2 Doc-Comment Ownership
- **Lint (`gml/normalize-doc-comments`)** owns:
  - legacy prefix/tag normalization (`// @tag`, `// /` forms)
  - `@description` promotion/cleanup
  - function-doc tag synthesis (`@description`, `@param`, `@returns`)
- **Plugin** owns:
  - rendering and spacing of already-existing/normalized doc comments
  - comment placement/layout that does not change text content
- **Core** owns:
  - shared doc-comment helpers used by lint/plugin
  - AST metadata utilities and normalization primitives

*Migration Rules:* Do not add new doc-comment content mutation logic in plugin printer/transforms. Any new doc-comment synthesis or tag/content rewrite must be implemented as lint rule behavior.

### 3.3 Lint/Refactor Overlap Resolution
1. `@gml-modules/lint` is the owner of **Diagnostic Reporting** and **Local Repairs**. It uses a single-file `fix` model for changes that are safe within the local scope or verified safe against a readonly project snapshot.
2. `@gml-modules/refactor` is the owner of **Global Transactions (Codemods)**. It implements a native, GML-centric Collection API (inspired by `jscodeshift`) to handle atomic cross-file edits, metadata updates (`.yy`, `.yyp`), and structural migrations.
3. Shared project-analysis answers are produced by one shared provider, but only `refactor` has the authority to write to multiple files in one pass.
4. If a lint rule requires a change that impacts the project's graph or metadata (e.g., a formal `asset_name` update), it should **report the diagnostic** and **point the user to a refactor command**, rather than attempting a multi-file autofix through ESLint.
5. No duplicate capability logic is allowed across lint and refactor surfaces.
6. No legacy support is added: no wrappers, aliases, compatibility toggles, or parallel code paths.

*Capability ownership matrix:*
- Identifier occupancy checks: implementation owner = shared provider; lint/refactor = consumers.
- Identifier occurrence-file lookup: implementation owner = shared provider; lint/refactor = consumers.
- **Local Safe Rewrites** (Operator aliases, basic logic): lint only.
- **Cross-file Transactional Rename / Deletion**: refactor only.
- **Metadata rewrite/edit orchestration for .yy/.yyp**: refactor only.
- **Project Migrations** (e.g., GMS2-to-GMS2024 structural shifts): refactor only.

*Why a Codemod model for Refactor?*
1. **Transactional Integrity**: Ensures all occurrences and metadata reflect a single atomic change; if one file fails, the entire change rolls back.
2. **Native Tooling Alignment**: By implementing the pattern natively (utilizing `fast-glob` for discovery and `jsonc-parser` for manifests), the workspace avoids `ast-types` mapping overhead and utilizes `@gml-modules/parser` and `@gml-modules/plugin` directly.
3. **Beyond-GML Scope**: Simplifies changes to non-code assets (JSON, XML, bitmaps) that ESLint cannot visit.
4. **Decoupled Execution**: Refactor commands can be run independently of linting, making one-time transitions cleaner and faster.

## 4. Implementation Status & Audit Findings (Snapshot 2026-02-17)

- Formatter/linter split migration is largely complete on runtime behavior:
  - formatter is strict/layout-first and does not expose legacy semantic/refactor adapter hooks;
  - lint owns migrated semantic/content rewrite responsibilities.
- `plugin`, `lint`, and `cli` workspace suites remain largely stable.
- Legacy formatter-lint adapter integration paths were removed from active runtime wiring and tests.

### 4.1 Aligned with pinned linter contracts
1. Lint workspace public-surface contracts are implemented and passing.
2. ESLint v9 language-object behavior is enforced by min/latest ESLint contract tests.
3. Overlay guardrail behavior (`GML_OVERLAY_WITHOUT_LANGUAGE_WIRING`) is implemented and covered.
4. Project-context registry behavior is covered by dedicated lint tests.
5. Missing-context emission policy and unsafe-fix reason-code declaration/validation are covered by rule contract tests.
6. Rule implementation coverage now enforces non-placeholder behavior.

### 4.2 Misaligned / remaining gaps against full split plan
1. Shared provider end-state is not complete yet (text provider still exists as an internal fallback surface).
2. Shared-provider parity tests are not present yet.
3. Workspace-separation cleanup is functionally enforced at runtime but still disorganized in source layout (formatter transform registry still contains/exports legacy migrated transform modules).

### 4.3 Remaining work to reach strict full-plan completion
1. Implement a semantic-backed `ProjectAnalysisProvider` shared by lint and refactor.
2. Add shared-provider parity contract tests.
3. Finish docs migration cleanup in remaining package docs.
4. Remove or isolate dormant migrated semantic transform modules from formatter workspace exports.
5. Continue tightening fixer fidelity where conservative text rewrites remain.

### 4.4 Formatter-Only Ownership Ledger (Exhaustive)
*Audited plugin test files: 90. Audited formatter fixture basenames: 91.*

**Formatter functionality migration map (target state):**
- `#define`/legacy region normalization and macro canonicalization -> `lint` (`gml/normalize-directives`)
- Missing argument separator preservation/synthesis -> `lint` (`gml/require-argument-separators`)
- Optional parameter default synthesis (`= undefined`) -> `lint` (`gml/require-trailing-optional-defaults`)
- Data-structure accessor rewrites (`[?`, `[|`, `[#`) -> `lint` (`gml/normalize-data-structure-accessors`)
- Conditional assignment sanitizer (`if (a = b)`) -> `lint` (`gml/no-assignment-in-condition`)
- Guard/if structural rewrites -> `lint` (`gml/require-control-flow-braces`)
- Doc-comment content rewriting/promotion/synthesis -> `lint` (`gml/normalize-doc-comments`)
- Comment banner/content normalization -> `lint` (`gml/normalize-doc-comments`)
- String/math/logical semantic rewrites -> `lint` (`gml/prefer-string-interpolation`, `gml/optimize-math-expressions`, `gml/optimize-logical-flow`, `gml/normalize-operator-aliases`)
- Struct assignment consolidation and loop-hoist rewrites -> `lint` (`gml/prefer-struct-literal-assignments`, `gml/prefer-loop-length-hoist`)
- Pure layout rendering -> `plugin`

## 5. Public API Contracts

### 5.1 Public API and Workspace Changes
1. Add new workspace at `src/lint` with package name `@gml-modules/lint`.
2. Keep `src/plugin` as formatter-only (`@gml-modules/plugin`).
3. Add lint command implementation in `src/cli/src/commands/lint.ts`.
4. Root namespace export for lint package: `export { Lint } from "./src/index.js";`
5. Lint namespace export surface: `plugin`, `configs`, `ruleIds`, `services`.
6. `Lint.ruleIds` contract: frozen, full-ID map for both `gml/*` and `feather/*` rules.
7. `Lint.configs` contract: `recommended`, `feather`, and `performance` are readonly flat-config arrays.
8. Feather manifest export contract: parity manifest is exported as typed runtime data from lint workspace code.

### 5.2 ESLint v9 Language Wiring Contract (Pinned)
1. `Lint.plugin` is the object registered under `plugins.gml`.
2. `Lint.plugin.languages.gml` is the ESLint v9 language object used via `language: "gml/gml"`.
3. This migration implements a **language plugin**, not `languageOptions.parser`.

### 5.3 Recommended Config Contract (Pinned)
1. `Lint.configs.recommended` is a complete flat-config preset, not rule-only.
2. It already includes: `files: ["**/*.gml"]`, `plugins: { gml: Lint.plugin }`, `language: "gml/gml"`, baseline recommended rules/severities.
3. CLI fallback behavior: when no user flat config is discovered, CLI applies `Lint.configs.recommended`.

### 5.4 CLI Loading, Discovery, Merging, and Output (Pinned)
1. `lint <paths...>` delegates file enumeration to ESLint `lintFiles()`.
2. If `--config` is provided, CLI sets `overrideConfigFile` to that path.
3. If `--config` is absent, CLI uses ESLint flat-config discovery.
4. If no user config is found, CLI falls back to bundled `Lint.configs.recommended`.
5. `ignores` are flat-config-driven; `.eslintignore` is not used.
6. Supported formatter values are `stylish`, `json`, `checkstyle`.

### 5.5 Direct ESLint Usage Compatibility (Pinned)
1. Direct `eslint` usage without the CLI is supported for syntactic and local rules.
2. Project-aware rules require project context injection from the CLI runtime.

## 6. Formatter Boundary & Allowlist

### 6.1 Formatter Boundary (Pinned)
1. Formatter may only perform layout and canonical rendering transforms.
2. Formatter must not perform semantic/content rewrites or syntax repair.
3. `logicalOperatorsStyle` remains formatter-only and is limited to canonical alias rendering of equivalent logical operators.
4. `normalizeDocComments` moves to lint because it mutates comment text content.
5. Invalid code handling: Formatter parses strictly. On parse failure, formatter fails and does not mutate source. Syntax repairs are lint-only (`lint --fix`).

### 6.2 Formatter Transform Allowlist (Pinned)
1. Allowed formatter transforms are limited to:
   - indentation/whitespace normalization
   - line-break wrapping and blank-line normalization
   - spacing around punctuation/operators
   - parenthesis/grouping rendering that does not change semantics
   - trailing delimiter layout where grammar-equivalent
   - final newline normalization at EOF
   - `logicalOperatorsStyle` alias canonicalization
2. Comment policy: comment placement may be reflowed for layout. Comment text content must remain verbatim unless a dedicated lint rule owns that content transform.
3. Formatter must not: rewrite identifiers/literals for semantics/content purposes, perform syntax repair, apply cross-file or project-aware rewrites.

### 6.3 Logical Operator Canonicalization Scope (Pinned)
1. `logicalOperatorsStyle` affects only logical operator aliases (`&&`, `||`, `and`, `or`).
2. Canonicalization policy:
   - `keywords` mode rewrites `&&` -> `and` and `||` -> `or`
   - `symbols` mode rewrites `and` -> `&&` and `or` -> `||`
   - mixed usage is normalized to one canonical style per file output
3. Non-target operators are never rewritten by this option.

## 7. Internal Implementation Contracts

### 7.1 ESLint v9 Language Object Interface (Pinned)
1. `Lint.plugin.languages.gml` implements the ESLint v9 `Language` interface.
2. Implemented language methods: `parse(...)`, `createSourceCode(...)`, `validateLanguageOptions(...)`.
3. Pinned GML language behavior: `fileType: "text"`, `lineStart: 1`, `columnStart: 0`, `nodeTypeKey: "type"`, `defaultLanguageOptions: { recovery: "limited" }`, `visitorKeys: GML_VISITOR_KEYS`.

### 7.2 Language Options Validation UX (Pinned)
1. Validation uses the effective file-level language options provided by ESLint.
2. Unsupported keys fail fast with a stable error code: `GML_LANGUAGE_OPTIONS_UNSUPPORTED_KEY`.

### 7.3 Parser Services Interface (Pinned)
1. Stable minimal `parserServices.gml` interface includes `schemaVersion`, `filePath`, `recovery`, `directives`, `enums`.
2. `parserServices.gml` intentionally does not expose CST internals.

### 7.4 AST/Token/Comment Contract (Pinned)
1. Output model is ESTree-compatible plus explicit GML extension node types.
2. `range` is always `[start, end)` in UTF-16 code-unit offsets.
3. `loc` is always `line: 1-based`, `column: 0-based`.

### 7.5 Token and Comment Semantics (Pinned)
1. `Program.tokens` ordering and integrity: strictly source-order, non-overlapping ranges.
2. Recovery-inserted separators are **not** emitted as synthetic tokens in `Program.tokens`.
3. `Program.comments` includes all comments in source order.

### 7.6 Recovery Index Projection Contract (Pinned)
1. Limited recovery may parse against a virtual patched representation of the file (for missing separators only).
2. A monotonic offset-projection map from virtual offsets back to original-source offsets is required.
3. All emitted AST `loc`/`range` and token `loc`/`range` are projected to original-source coordinates.

### 7.7 Extension Node Placement and Traversal (Pinned)
1. Extension nodes (`GmlMacroDeclaration`, `GmlDirectiveStatement`, `GmlMissingArgument`, `GmlEnumDeclaration`, `GmlEnumMember`) are first-class AST nodes.
2. All extension nodes are traversable through `visitorKeys` and selector-based rule traversal.

### 7.8 Parse Errors and Recovery Contract (Pinned)
1. Language parse never throws uncaught exceptions to ESLint.
2. `languageOptions.recovery` options: `"none"` (strict parse only), `"limited"` (default: run only missing-argument-separator recovery before parse).
3. If strict/limited parse fails, parse failures are returned through ESLint v9’s documented language parse-failure channel.

### 7.9 Parser Services Presence Rules (Pinned)
1. On parse failure, rules do not run for that file and `parserServices.gml` is absent.
2. On successful parse without recovery edits, `parserServices.gml` is present and `parserServices.gml.recovery` exists as an empty collection.
3. On successful parse with limited recovery edits, `parserServices.gml` is present and `parserServices.gml.recovery` contains projected insertion metadata.

### 7.10 Project Root, Indexing, and Cache Lifecycle (Pinned)
1. CLI adds `--project <path>` as explicit project-root override.
2. Without `--project`, root resolution is nearest ancestor containing a GameMaker manifest (`.yyp`) from each linted file path; fallback is CLI `cwd`.
3. Runtime owns one invocation-scoped `ProjectLintContextRegistry` keyed by resolved root.
4. Each context indexes `.gml` sources under root once, using semantic/refactor-backed analysis data, with hard excludes: `.git`, `node_modules`, `dist`, `generated`, `vendor`.
5. Context is immutable for the lint invocation.

### 7.11 Project Analysis Inputs and Outputs (Pinned)
1. Context indexing consumes semantic/refactor workspace APIs as the only authoritative project-analysis inputs for this migration.
2. Minimum required analysis outputs per root: identifier occupancy index, identifier occurrence locations per file, safe loop-hoist name-resolution constraints, rename/conflict planning data for feather/global rewrites.

### 7.12 `--fix` Pass and Snapshot Semantics (Pinned)
1. CLI executes one ESLint invocation with `fix: true` when `--fix` is requested.
2. ESLint may apply its internal fix passes, but the project-aware context remains the original pre-fix filesystem snapshot for the full invocation.
3. Project-aware services never re-read modified file contents produced by current-run fixes.

### 7.13 Assumptions and Defaults
1. Node runtime baseline remains `>=22.0.0` across workspaces.
2. ESLint major is pinned to v9 (`>=9.39.0 <10`) for lint package compatibility.
3. Project-aware context is intentionally immutable per invocation; no in-run incremental reindexing under `--fix`.
4. Formatter and linter remain separate commands and separate responsibilities.

### 7.14 Dependency and Versioning Model (Pinned)
1. `@gml-modules/lint` declares `eslint` as a peer dependency (`>=9.39.0 <10`) and as a dev dependency for workspace tests.
2. `@gml-modules/cli` declares `eslint` as a runtime dependency to provide first-run CLI UX without requiring separate global ESLint installation.

## 8. Rule System Contracts

### 8.1 Rule Access to Language Services (Pinned)
1. Rules access language-specific metadata through `context.sourceCode.parserServices.gml`.
2. Project-aware data access is via `Lint.services` helpers injected into rule execution context (`context.settings.gml.project`).
3. Missing-context behavior: project-aware rules must report `messageId: "missingProjectContext"` and emit no fixes.

### 8.2 Standardized “Unsafe to Fix” Reporting
1. Shared helper required for all project-aware rules: `messageId: "unsafeFix"` with stable prefix `[unsafe-fix:<reasonCode>]`.
2. Required reason fields for every unsafe report: `reasonCode` (machine-stable short code), `reason` (human-readable).
3. Rule option convention for CI control: `reportUnsafe` (default `true`).

### 8.3 Unsafe Reason Code Policy (Pinned)
1. `reasonCode` namespace is global and semver-public for lint consumers.
2. `reasonCode` format is uppercase snake case (`[A-Z0-9_]+`).
3. Minimum starter reason-code set: `MISSING_PROJECT_CONTEXT`, `NAME_COLLISION`, `CROSS_FILE_CONFLICT`, `SEMANTIC_AMBIGUITY`, `NON_IDEMPOTENT_EXPRESSION`.

### 8.4 Lint Fixer Edit Boundary (Pinned)
1. Fixers are single-file only and must not perform cross-file writes.
2. Fixers must preserve file encoding/BOM and existing dominant line-ending style.
3. Fixers may not reorder unrelated top-level statements, directives, or regions unless that specific rule contract explicitly permits it.

### 8.5 Rule Migration Matrix with Concrete Schemas
- `gml/prefer-loop-length-hoist`
- `gml/prefer-hoistable-loop-accessors`
- `gml/prefer-repeat-loops`
- `gml/prefer-struct-literal-assignments`
- `gml/optimize-logical-flow`
- `gml/no-globalvar`
- `gml/normalize-doc-comments`
- `gml/normalize-directives`
- `gml/require-control-flow-braces`
- `gml/no-assignment-in-condition`
- `gml/normalize-operator-aliases`
- `gml/prefer-string-interpolation`
- `gml/optimize-math-expressions`
- `gml/require-argument-separators`
- `gml/normalize-data-structure-accessors`
- `gml/require-trailing-optional-defaults`

### 8.6 Rule Behavioral Contracts (Pinned)
*(Detailed behavioral contracts for each rule as defined in the original split plan)*

### 8.7 Required Before/After Examples in the Doc
1. Loop hoist:
   - Before: `for (var i = 0; i < array_length(items); i++) {}`
   - After: `var items_len = array_length(items); for (var i = 0; i < items_len; i++) {}`
2. Globalvar rewrite:
   - Before: `globalvar score; score = 0;`
   - After (safe): `global.score = 0;`
3. Missing separators:
   - Before: `draw_text(x y "score");`
   - After: `draw_text(x, y, "score");`

### 8.8 Syntax Variant Note for Examples (Pinned)
1. Documentation examples must only use syntax accepted by the shipped parser grammar.
2. `for` initializer examples may use either inline declaration form or predeclared initializer form.

### 8.9 Recommended Rule Baseline Appendix (Pinned)
1. `Lint.configs.recommended` canonical rule set (initial migration baseline):
   - `gml/prefer-loop-length-hoist` (warn, project-aware)
   - `gml/prefer-hoistable-loop-accessors` (warn)
   - `gml/prefer-repeat-loops` (warn)
   - `gml/prefer-struct-literal-assignments` (warn, project-aware)
   - `gml/optimize-logical-flow` (warn)
   - `gml/no-globalvar` (warn, project-aware)
   - `gml/normalize-doc-comments` (warn)
   - `gml/normalize-directives` (warn)
   - `gml/require-control-flow-braces` (warn)
   - `gml/no-assignment-in-condition` (warn)
   - `gml/normalize-operator-aliases` (warn)
   - `gml/prefer-string-interpolation` (warn, project-aware)
   - `gml/optimize-math-expressions` (warn)
   - `gml/require-argument-separators` (error)
2. Additional migrated `gml/*` rules are implemented and fixture-backed but are not in the default recommended preset: `gml/normalize-data-structure-accessors`, `gml/require-trailing-optional-defaults`.
3. `recommended` does not enable `feather/*` rules by default; use `Lint.configs.feather` for feather diagnostics.
