## Objective
Replace the ad‑hoc `wrapDocDescriptionLines` string reflow code with a Prettier doc‑builder driven solution so that `/// @description` blocks are wrapped by Prettier’s built‑in algorithms, avoiding duplicated wrapping logic and ensuring output matches the rest of the formatter.

## Step-by-step plan
1. **Completed scaffolding**
   * `description-doc.ts` now builds Prettier docs for `/// @description` blocks using `concat`, `fill`, `group`, `line`, etc., and reuses `resolveDescriptionIndentation` so indentation matches the previous normalization logic.
   * The printer (`src/plugin/src/printer/print.ts`) understands doc-comment print options, accepts `Doc` instances instead of raw strings, and no longer calls the legacy wrapping helpers during emission.
   * `prettier-doc-builders.ts` exposes `fill`, and normalization no longer directly mutates description text, allowing the printer to own wrapping entirely.
2. **Remaining convergence tasks**
   * **Tests & fixtures**: Update each doc-comment test that asserts exact text (e.g., `doc-comment-wrapping.test.ts`, `doc-comment-description-promotion.test.ts`, `plugin.test.ts`) to expect the Prettier-managed breaks. Regenerate output fixtures under `src/plugin/test/*.output.gml` whose `@description` continuations shift (notably `testFunctions.output.gml`, `testComments.output.gml`, `testGM*.output.gml`), ensuring the text still respects manually preserved continuations.
   * **Metadata guarantees**: Confirm `_preserveDescriptionBreaks` continues to bypass the Prettier doc builder so descriptions opted out keep their original line splits. If the flag is true, the helper should return the raw string lines (or a doc that emits them verbatim) rather than reflowing them.
   * **Cleanup**: Remove the obsolete `description-wrapping.ts`, `wrapDocDescriptionLines`, and similar helpers once their behavior is fully replaced by `description-doc.ts`/Prettier docs; keep only the shared `description-utils.ts` exports (like `resolveDescriptionIndentation`) that are still needed elsewhere for continuation detection or indentation.
3. **Validation**
   * Run `npm run build:types --workspace=@gml-modules/plugin` and then `npm run test:plugin` (which internally builds and runs node tests) to ensure the suite passes against the updated fixtures.
   * After regenerating any golden files, double-check they are the only files modified and meet the new wrapping expectations before staging.

## Risks & Follow-ups
* Prettier’s `fill`/`group` output may cause line breaks at different words than the former custom wrapper, so every fixture asserting continuation text must be updated carefully to avoid regressions.
* The `_preserveDescriptionBreaks` flag must still be honored; failing to do so would alter existing behavior for docs that intentionally keep their own line breaks.
* Once doc-comment wrapping is fully delegated to Prettier, the legacy rewrap helpers can be removed, but any fallback logic must be migrated into `description-doc.ts` (e.g., for manual continuations).
