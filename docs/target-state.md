# Target State & Architecture Plan

This document synthesizes the target state for the GameMaker Language parser project, encompassing the formatter/linter split, semantic analysis, transpiler, and hot-reload pipeline.

## 1. Summary & Objectives

1. **Strict Separation of Concerns**: Split responsibilities into a formatter-only workspace (`@gml-modules/format`), an ESLint v9 language+rules workspace (`@gml-modules/lint`), a refactor workspace (`@gml-modules/refactor`), and shared core utilities (`@gml-modules/core`).
2. **Deterministic Formatting**: Keep the formatter deterministic and non-semantic; move all non-layout rewrites to the linter's (`@gml-modules/lint`) rules with explicit diagnostics and optional `--fix`. Lexical canonicalization (e.g., operator aliases, numeric literal formatting) is permitted in the formatter, but syntactic/semantic rewriting is not. Any structural or semantic fixes must live in the `lint` workspace.
3. **Robust Semantic Analysis**: Implement a semantic layer that annotates the parse tree to power linting, refactoring, and transpilation, using the Sourcegraph Code Intelligence Protocol (SCIP) as the canonical symbol index.
4. **Live Hot-Reloading**: Enable true hot-loading of GML code, assets, and shaders without restarting the game by transpiling GML to JavaScript on demand and injecting it via a runtime wrapper.

## 2. Workspace Ownership Boundaries

### 2.1 General Ownership
- **Formatter (`@gml-modules/format`)**: Layout-only printing, indentation, wrapping, spacing, semicolon layout, print-width wrapping, logical operator style rendering. Must not synthesize or normalize content. Lexical canonicalization is permitted, but syntactic/semantic rewriting is not. Any structural or semantic fixes must live in the `lint` workspace.
- **Linter (`@gml-modules/lint`)**: Semantic/content rewrites, synthetic tag generation, legacy prefix/tag normalization, and local single-file diagnostics and autofix rewrites.
- **Refactor (`@gml-modules/refactor`)**: Codemod / migration transforms, explicit rename/refactor transactions (cross-file edits, metadata edits, impact analysis, hot-reload validation), and all project-aware functionality.
- **Core (`@gml-modules/core`)**: Shared doc-comment helpers, AST metadata utilities, and normalization primitives.
- **CLI Watcher (`@gml-modules/cli`)**: Monitors the filesystem, coordinates the transpilation pipeline, and manages the WebSocket server.
- **Transpiler (`@gml-modules/transpiler`)**: Parses GML via ANTLR4, converts GML AST to JS, and generates patch objects.
- **Runtime Wrapper (`@gml-modules/runtime-wrapper`)**: Injected into the browser; maintains a hot registry of patched functions and overrides GML dispatchers.

### 2.2 Doc-Comment Ownership
- **Lint (`gml/normalize-doc-comments`)** owns legacy prefix/tag normalization, `@description` promotion/cleanup, and function-doc tag synthesis.
- **Format** owns rendering and spacing of already-existing/normalized doc comments, and comment placement/layout that does not change text content.
- **Core** owns shared doc-comment helpers used by lint/format.

*Migration Rules:* Do not add new doc-comment content mutation logic in format printer/transforms. Any new doc-comment synthesis or tag/content rewrite must be implemented as lint rule behavior.

### 2.3 Lint/Refactor Overlap Resolution
1. `@gml-modules/lint` is the owner of **Diagnostic Reporting** and **Local Repairs**. It uses a single-file `fix` model for changes that are safe within the local scope.
2. `@gml-modules/refactor` is the owner of **Global Transactions (Codemods)**. It handles atomic cross-file edits, metadata updates (`.yy`, `.yyp`), and structural migrations.
3. If a lint rule requires a change that impacts the project's graph or metadata, it should **report the diagnostic** and **point the user to a refactor command**, rather than attempting a multi-file autofix through ESLint.
4. No duplicate capability logic is allowed across lint and refactor surfaces.

### 2.4 Refactor Tool (Codemod / Migration Transforms)
- **Purpose**: Project-wide, sometimes project-aware rewrites that are not “formatting” and not small local lint fixes.
- **Scope**: Multi-file changes, API migrations, mechanical refactors, structural rewrites, workspace-wide rename/update operations. All project-aware functionality currently in the `lint` workspace should become part of the refactor workspace.
- **Behavior**: Explicit, opt-in, typically run as a one-off or scripted step; may use project index/symbol info; can be destructive by design but controlled.
- **Order in pipeline**: codemod → formatter → lint/typecheck/tests.

### 2.5 Non-Goals
To prevent scope creep and future drift, the following are explicitly out of scope for each workspace:
- **Formatter does not perform**: Syntax repair, project-aware rewrites, structural refactors, or semantic transformations.
- **Lint does not perform**: Cross-file edits or metadata updates.
- **Refactor does not**: Run automatically on save.

## 3. Formatter & Linter Contracts

### 3.1 Handling Malformed GML (Two-Tier Workflow)
Use a two-tier workflow: format only when parse succeeds, and run lint in two phases to apply “safe fixes” to malformed code.
- **Phase A: Token-based / tolerant fixes (runs even on malformed code)**: Apply local, unambiguous rewrites (e.g., `&&` → `and`, `#define` → `#macro`).
- **Phase B: AST-based lint fixes (runs only if parse succeeds)**: Run semantic rules and fixers.
- **Formatter**: Requires a valid parse; if parse fails, it should error and not change files. The formatter must never attempt recovery or fallback printing. Lint Phase A may still apply safe fixes even when the parse fails.

### 3.2 Formatter Boundary & Allowlist
1. Formatter may only perform layout and canonical rendering transforms (indentation, wrapping, spacing, parenthesis rendering, trailing delimiters, final newline, `logicalOperatorsStyle` alias canonicalization).
   - *Parentheses*: Formatter may remove redundant syntactic constructs when provably unnecessary (e.g., redundant parentheses), but must not synthesize new syntax for readability or restructuring.
   - *Numeric Literals*: Canonical numeric literal normalization (e.g., `.5` → `0.5`, `5.` → `5`) is permitted as zero-normalization.
   - *Numeric Literal Ownership Clarification*: Rewriting existing decimal literals that only differ by missing leading/trailing zeros remains formatter-owned behavior (`@gml-modules/format`). Lint rules such as `optimize-math-expressions` must not rewrite those literals in place. Exception: when a lint math optimization folds an expression and synthesizes a new literal result, the synthesized literal should be emitted in formatter-normalized form to avoid follow-up churn (for example, `1. - .5` folding to `0.5`).
2. Formatter must not perform semantic/content rewrites or syntax repair.
3. Invalid code handling: Formatter parses strictly. On parse failure, formatter fails and does not mutate source. The formatter must never attempt recovery or fallback printing. Syntax repairs are lint-only (`lint --fix`).

### 3.3 Public API & Internal Implementation Contracts
- **ESLint v9 Language Wiring**: `Lint.plugin.languages.gml` implements the ESLint v9 `Language` interface.
- **Recommended Config**: `Lint.configs.recommended` is a complete flat-config preset.
- **AST/Token/Comment Contract**: Output model is ESTree-compatible plus explicit GML extension node types. `range` is `[start, end)` in UTF-16 code-unit offsets.
- **Parse Errors and Recovery**: Language parse never throws uncaught exceptions to ESLint. Parse failures are returned through ESLint v9’s documented language parse-failure channel.
- **Project Context**: CLI adds `--project <path>` as explicit project-root override. Runtime owns one invocation-scoped `ProjectLintContextRegistry`.

### 3.4 Rule System Contracts
- **Language Services**: Rules access language-specific metadata through `context.sourceCode.parserServices.gml`.
- **Unsafe to Fix Reporting**: Shared helper required for rules that might be unsafe: `messageId: "unsafeFix"` with stable prefix `[unsafe-fix:<reasonCode>]`.
- **Fixer Edit Boundary**: Fixers are single-file only and must not perform cross-file writes. Project-aware functionality and cross-file edits belong in the `refactor` workspace.

### 3.5 Implementation Status & Audit Findings (Snapshot 2026-02-17)
- Formatter/linter split migration is largely complete on runtime behavior.
- Remaining work includes implementing a semantic-backed `ProjectAnalysisProvider`, adding shared-provider parity contract tests, and isolating dormant migrated semantic transform modules from formatter workspace exports.
- Any existing/left-over functionality in the `format` workspace that goes beyond pure layout formatting should be identified and migrated into the `lint` and/or `core` workspaces.

## 4. Semantic Analysis & Symbol Indexing

### 4.1 Semantic Analysis Requirements
ANTLR4 provides syntactic structure but no meaning. A semantic layer annotates the parse tree so the emitter can make correct decisions (e.g., symbol resolution, type consistency, function dispatch, scope boundaries, resource references).

### 4.2 Identifier Resolution Policy
Semantic annotations should classify identifiers deterministically:
1. **Local scope** → emit as bare identifiers in JavaScript.
2. **`self` fields** → emit `self.<name>`.
3. **`other` fields** → emit `other.<name>`.
4. **`global` fields** → emit `<GLOBALS>.<name>`.
5. **Built-in functions or constants** → emit shimmed references.
6. **Script calls** → emit through the hot registry or wrapper thunk.

### 4.3 Canonical Symbol Index (SCIP)
Use the Sourcegraph Code Intelligence Protocol (SCIP) as the single, canonical representation of symbol definitions and references.
- **Standardized & Compact**: Ideal for rapid reload cycles.
- **Deterministic Symbol Naming**: Adopt a URI-like scheme: `gml/<kind>/<qualified-name>` (e.g., `gml/script/scr_damage_enemy`).
- **Minimal Hot-Reload Queries**: Read definition occurrences for a file, collect reference occurrences for dependents, and recompile target symbols.

### 4.4 Intermediate Representation Storage
Persisting semantic results in SQLite enables fast queries, tooling, and dependency analysis while retaining a portable JSON interchange format. The schema includes `nodes` (symbols/syntax anchors) and `edges` (directed relationships).

## 5. Transpiler & Hot Reload Pipeline

### 5.1 Core Concept & Role of the Transpiler
The hot reload system bypasses the static nature of the GameMaker HTML5 runner by providing a side-channel for JavaScript "patches" generated from fresh GML source. The ANTLR4 → JS Transpiler generates JavaScript for changed GML every time a watched file changes, reproducing the code generation logic necessary for hot reloads.

### 5.2 System Architecture
- **Dev Server (Node.js/CLI)**: Watches GML files, transpiles them into JavaScript functions on demand, and broadcasts them as JSON patches via WebSocket.
- **Runtime Wrapper (Browser)**: Listens for patches via WebSocket and swaps function references in the GameMaker engine's internal registry.

### 5.3 The Hot Reload Lifecycle (Event Flow)
1. **Initialization**: CLI starts the transpiler, WebSocket server, and filesystem watcher.
2. **Detection & Transpilation**: Watcher detects edits, parses GML, emits JS, and creates a patch object.
3. **Patch Delivery**: Server broadcasts the JSON payload; Runtime Wrapper validates and installs the new JS `Function` in the `__hot` registry.
4. **Execution**: `gml_call_script` is intercepted, checks the hot registry, and executes the new logic using existing instance state.

### 5.4 Integration Strategies
- **Bootstrap Wrapper (Recommended)**: Load the upstream runtime first, followed by a small `wrapper.js` that routes dispatchers through the hot registry.
- **Sidecar Iframe**: Serve a development page hosting the GameMaker export in an `<iframe>`.
- **Service Worker Overlay**: Intercept requests for `index.html` and inject the wrapper code dynamically.

### 5.5 Technical Specifications
- **Hot-Swappable Components**: Scripts, Object Events, Macros/Enums, Shaders.
- **Closures**: Uses a versioned closure routing system to ensure new closures capture the latest code.
- **Performance**: Typical total latency is 120-180ms.
- **Recovery**: Syntax errors broadcast an error notification, preserving existing logic.

### 5.6 Future Enhancements
- Semantic analysis for automatic dependency-aware rebuilds.
- Asset hot-reloading (sprites, sounds) via resource ID stable-swapping.
- Source map generation for in-game debugging of patched GML.
- In-game UI for patch rollback and version management.
