## Objective
Replace the ad‑hoc `wrapDocDescriptionLines` string reflow code with a Prettier doc‑builder driven solution so that `/// @description` blocks are wrapped by Prettier’s built‑in algorithms, avoiding duplicated wrapping logic and ensuring output matches the rest of the formatter.

## Step-by-step plan
1. **Observation & scaffolding**
   * Document the current behavior (existing `wrapDocDescriptionLines` in `src/plugin/src/printer/doc-comment/function-docs.ts` + `description-wrapping.ts` and the transform hook in `doc-comment/doc-comment-normalization.ts`).
   * List the gated tests that currently depend on the line-level behavior (`doc-comment-wrapping.test.ts`, `doc-comment-description-promotion.test.ts`, `plugin.test.ts` fixtures, and the affected `.output.gml` fixtures).
2. **Introduce Prettier doc conversion helper**
   * Create a helper module under `src/plugin/src/printer/doc-comment/description-doc.ts` that:
     * Detects `/// @description` lines + continuations.
     * Builds a Prettier doc (groups/fill/line) for the full description text rather than splitting strings manually.
     * Emits the built doc when printing the doc block.
   * Ensure the helper exposes both string and `Doc` entries so the rest of the printer can work with it.
3. **Wire the helper into the printer**
   * Update `src/plugin/src/printer/print.ts`:
     * Import the helper and `resolveDocCommentPrinterOptions`.
     * After `normalizeFunctionDocCommentDocs` runs, call the helper with the resolved `printWidth` and use `join(hardline, ...)` on the returned doc list.
   * Remove the old `wrapDocDescriptionLines` call from the printer and transform.
4. **Update the normalization transform**
   * `src/plugin/src/transforms/doc-comment/doc-comment-normalization.ts`: drop any references to the wrapping helper but ensure description continuations are still normalized (maybe via the shared helper, or adjust the transform to just remove function doc tags).
5. **Adjust helper utilities**
   * If needed, move common indentation helpers (like `resolveDescriptionIndentation`) into shared location and export them from `src/plugin/src/transforms/doc-comment/description-utils.ts` for reuse by the new helper.
6. **Update tests & fixtures**
   * Update `src/plugin/test/doc-comment-wrapping.test.ts` to expect the new wrapping style (line breaks determined by Prettier’s doc builder; likely fewer continuation lines for short widths).
   * Regenerate impacted fixtures (`testFunctions.output.gml`, `testComments.output.gml`, `testGM*.output.gml`, etc.) to capture the new continuation pattern.
   * Ensure the synthetic doc comment generation tests (`doc-comment-description-promotion.test.ts`, `plugin.test.ts` fixtures) continue to assert the right semantically equivalent behavior (possibly relax strict line matching where the Prettier doc builder inherently manages breaks).
7. **Validation**
   * Run `npm run build:types --workspace=@gml-modules/plugin`.
   * Run `node --test src/plugin/dist/test/doc-comment-wrapping.test.js` (and the broader `npm run test:plugin` after the fixtures are updated).
   * Check that golden files produce the expected output and commit updated fixtures.

## Risks & Follow-ups
* Prettier’s doc builder may insert breaks differently than the manual logic, so existing fixtures/tests will all need adjustments.
* The helper must respect `_preserveDescriptionBreaks` flags or other metadata that currently prevent wrapping; preserve that behavior.
* After updating fixtures, re-run the full plugin test suite to catch any remaining mismatches.
