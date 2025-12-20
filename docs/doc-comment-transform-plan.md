## Doc Comment Transform Plan

### Goals
- Centralize all doc-comment synthesis and normalization in a single plugin transform so behavior is consistent and testable.
- Remove string-level post-processing from `plugin-entry.ts` and ad hoc logic buried in unrelated transforms.
- Reuse the Core doc-comment services (`computeSyntheticFunctionDocLines`, `mergeSyntheticDocComments`, traversal manager) so synthetic docs and metadata flow through one API.
- Keep Feather diagnostics focused on Feather fixes; doc-comment shaping should not depend on the Feather option.
- Preserve the Core doc-comment utility implementations in `src/core/...`—the plugin should orchestrate rather than own the AST metadata logic so other consumers can reuse the same capabilities.

### Current State (scattered responsibilities)
- **Printer merge:** `src/plugin/src/printer/doc-comment/function-docs.ts#normalizeFunctionDocCommentDocs` calls `Core.mergeSyntheticDocComments` during printing. Synthetic emission is intertwined with printing concerns and runs late.
- **Feather-specific edits:** `src/plugin/src/transforms/apply-feather-fixes.ts` contains doc-comment utilities (`buildDocumentedParamNameLookup`, `extractDocumentedParamNames`, implicit argument doc remapping, deprecated doc detection) behind the Feather option, even though they are not diagnostic fixes.
- **String post-processing:** `src/plugin/src/plugin-entry.ts` rewrites doc comments after formatting (`promoteMultiLineDocDescriptions`, `tidyStringHeightDocBlock`, blank-line normalization). This bypasses AST guarantees and is invisible to transforms.
- **Core generation:** `src/core/src/comments/doc-comment/service/synthetic-generation.ts` computes synthetic lines and merges metadata, but callers are split across printer and Feather transform rather than a single pipeline stage.

### Target State
- A dedicated plugin transform (e.g., `doc-comment-normalization-transform`) runs on the AST before printing and handles **all** doc-comment shaping:
  - Collect existing doc blocks via `Core.resolveDocCommentCollectionService`/`resolveDocCommentTraversalService`.
  - Decide on synthesis using `Core.shouldGenerateSyntheticDocForFunction` and generate with `computeSyntheticFunctionDocLines`/`mergeSyntheticDocComments`.
  - Normalize param/returns ordering, continuation padding, leading blank lines, and separation from neighboring comments.
  - Apply description promotion currently done in `plugin-entry.ts` using AST comment data rather than string rewrites.
  - Respect options (e.g., `applyFeatherFixes` if we keep it as the gate, or a new `normalizeDocComments` boolean defaulting to true).
- The printer assumes doc comments are already normalized; `normalizeFunctionDocCommentDocs` becomes a thin formatter (or is removed entirely if unnecessary). Additionally, relocate the synthetic doc bookkeeping sprinkled through `src/plugin/src/printer/print.ts` (around the state updates near line 2167) so those responsibilities either defer to the new transform or disappear.
- `applyFeatherFixes` no longer owns doc-comment work. Any doc-related helpers it needs move into the shared doc-comment service so they can be reused by the new transform.
- No string-based doc mutations after `prettier.format`; formatting output should already reflect the transformed AST.

### Files to Create
- `src/plugin/src/transforms/doc-comment-normalization.ts` (new transform implementation).
- `src/plugin/src/transforms/index.ts` (export the new transform alongside others).

### Files/Functions to Move or Refactor
- From **`src/plugin/src/plugin-entry.ts`**:
  - Move `collectDocCommentSummaries`, `promoteMultiLineDocDescriptions`, `alignContinuationPadding`, `collectDescriptionBlockSize`, and doc-specific blank-line handling into the new transform. Remove the string-level rewriting in `format()`.
  - Keep non-doc utilities (e.g., vertex-format spacing) in place; only the doc-comment shaping logic moves.
- From **`src/plugin/src/transforms/apply-feather-fixes.ts`**:
  - Migrate doc-comment helpers marked with TODOs (`buildDocumentedParamNameLookup`, `extractDocumentedParamNames`, implicit argument doc update logic, deprecated doc detection) into a doc-comment utility module in Core (e.g., `src/core/src/comments/doc-comment/service/`), then consumed by the new transform.
  - Strip doc-comment side effects from the Feather transform so it only applies Feather diagnostics.
  - Ensure the doc-comment helpers around `collectDeprecatedFunctionNames` / `findDeprecatedDocComment` (near lines 6063‑6213) are either relocated to Core or invoked by the new transform instead of living in the Feather pipeline.
- From **`src/plugin/src/printer/doc-comment/function-docs.ts`**:
  - Remove or simplify the synthetic merge path (`normalizeFunctionDocCommentDocs`) so it assumes doc comments are already synthesized/normalized.
  - Keep printing/resolution of continuation padding if still needed, but do not trigger synthesis here.
- From **Core doc-comment services** (`src/core/src/comments/doc-comment/service/`):
  - Expose any shared helpers needed by the transform (e.g., documented param lookup, implicit argument doc mapping, override/name normalization) so the plugin transform can reuse them without duplicating logic.

### Step-by-Step Plan
1. **Introduce the transform scaffold**
   - Add `doc-comment-normalization.ts` with a `Transform` class mirroring existing transform pattern (`transform(ast, { options, sourceText })`).
   - Export it via `src/plugin/src/transforms/index.ts`.
   - Wire it into `applyFinalTransforms` in `src/plugin/src/parsers/gml-parser-adapter.ts`, gated by a doc-comment option (default true; optionally reuse `applyFeatherFixes` until a dedicated option exists).

2. **Port doc logic from `plugin-entry.ts`**
   - Reimplement description promotion and blank-line normalization using AST comments (via Core doc-comment manager) instead of string rewrites.
   - Remove the doc-comment post-processing block from `format()` once equivalent behavior exists in the transform.

3. **Extract doc helpers from `apply-feather-fixes.ts`**
   - Move `buildDocumentedParamNameLookup` and `extractDocumentedParamNames` (and related normalization helpers) into `src/core/src/comments/doc-comment/service/` as reusable utilities.
   - Relocate implicit argument doc remapping and deprecated doc detection to the new transform; the Feather transform should call the shared helpers only if needed for diagnostics, not mutate doc comments itself.

4. **Align synthetic generation flow**
   - In the new transform, call `Core.mergeSyntheticDocComments` (or `computeSyntheticFunctionDocLines` + merge) for functions where synthesis is desired.
   - Ensure static functions, constructor assignments, and implicit-argument docs follow the same path so tests like `synthetic-doc-comments.test.ts`, `doc-comment-implicit-params.test.ts`, and `function-parameter-docs.test.ts` stay covered.

5. **Simplify the printer**
   - Update `normalizeFunctionDocCommentDocs` to no-op on synthesis (or remove it if safe). It should only format existing doc lines.
   - Confirm `resolveDocCommentPrinterOptions` still applies indentation/continuation padding but does not trigger synthetic generation.

6. **Option surface**
  - Decide whether synthesis/normalization is always on or behind a dedicated option (e.g., `normalizeDocComments`, default true). If keeping `applyFeatherFixes` as the gate temporarily, document that the new option should replace it.
  - Update `default-plugin-components` option map and tests to reflect the chosen gate.

### Feather diagnostic considerations
- Some Feather diagnostics already rely on doc-comment metadata (e.g., `captureDeprecatedFunctionManualFixes` in `apply-feather-fixes.ts` reads `@deprecated` blocks and records automated fix metadata for tests like `feather-fixes.test.ts#2273`). These behaviors should stay in the Feather transform because they are tied to specific diagnostics.
- The new doc-comment transform must reuse the shared Core helpers when evaluating doc blocks so diagnostics and normalization agree on the same data. However, it should not run behind the same `applyFeatherFixes` guard unless the behavior truly belongs to fixing diagnostics; doc normalization should be opt-in but distinct.
- When migrating tests, keep the diagnostic suites (e.g., `feather-fixes.test.ts`) toggled with `applyFeatherFixes` so they continue to exercise `captureDeprecatedFunctionManualFixes`, while the doc-comment feature tests operate without that flag or by targeting the transform directly.

7. **Testing**
   - Add targeted tests under `src/plugin/test/` for the new transform (cover description promotion, synthetic @returns insertion, implicit argument remapping, static function name correction).
   - Ensure existing golden fixtures remain untouched; rely on AST-based checks rather than string post-processing.
   - Update existing doc-comment-focused tests (`synthetic-doc-comments.test.ts`, `doc-comment-implicit-params.test.ts`, `function-parameter-docs.test.ts`, `doc-comment-order.test.ts`, etc.) so they no longer set `applyFeatherFixes` merely to trigger doc changes. They should validate the new transform while Feather-specific suites continue exercising diagnostics only.

8. **Cleanup**
   - Remove doc-comment-specific TODOs in `apply-feather-fixes.ts` once helpers are relocated.
   - Delete dead code paths in the printer and plugin entry that were only needed for string-based doc tweaking.

### Target Integration Flow
```
parse -> (structural transforms) -> applyFeatherFixes? -> optional transforms -> doc-comment-normalization (new) -> final transforms -> print
```
- Synthetic doc decisions and normalization happen in the new transform.
- The printer outputs whatever the transform prepared—no post-format string surgery.

### Success Criteria
- Single, documented place to add or adjust doc-comment rules (the new transform).
- No doc-comment mutations in `apply-feather-fixes.ts` or `plugin-entry.ts`.
- Printer does not trigger synthesis.
- Core doc-comment services host shared helpers; no duplicated lookup logic in transforms.
- Tests cover synthetic doc behavior through the transform pipeline.
