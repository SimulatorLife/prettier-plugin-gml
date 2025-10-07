# Outstanding formatter tasks

The following gaps surfaced while running `npm run test:plugin` from the repository root.

:::task-stub{title="Install ANTLR runtime before executing plugin tests"}
1. Update the plugin test harness (e.g., `npm run test:plugin` script or supporting setup scripts) so the `src/parser` package installs its dependencies—particularly `antlr4`—before the Mocha fixtures execute.
2. Ensure the parser runtime is resolved from `src/parser/src/gml-parser.js` without relying on the plugin's own `node_modules` tree so the formatter can import the generated parser.
3. Re-run `npm run test:plugin` from the repository root to confirm the fixtures progress beyond the current `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'antlr4'` failure.
:::

:::task-stub{title="Emit synthetic doc comments for undocumented top-level functions"}
1. Update `shouldGenerateSyntheticDocForFunction` in `src/plugin/src/printer/print.js` so ordinary program-level `FunctionDeclaration`s without doc comments emit synthetic docs (see failures in `test23.output.gml`, `test24.output.gml`, `test25.output.gml`).
2. Ensure the merge logic in `mergeSyntheticDocComments` still avoids duplicating tags when real doc comments are present.
3. Re-run `npm run test:plugin` from the repository root and verify fixtures expecting synthetic docs now pass.
:::

:::task-stub{title="Normalize synthetic doc comment parameter names"}
1. Introduce a helper near `getParameterDocInfo` in `src/plugin/src/printer/print.js` that strips leading/trailing underscores from identifier text before emitting metadata.
2. Use the helper for both plain identifiers and default-parameter left sides so constructors in `test13.output.gml` produce `foo`, `bar`, etc., instead of `_foo`.
3. Re-run `npm run test:plugin` from the repository root and confirm constructor fixtures (e.g., `test13.output.gml`) match.
:::

:::task-stub{title="Improve doc comment metadata merging"}
1. Extend `parseDocCommentMetadata` in `src/plugin/src/printer/print.js` to understand typed params (e.g., `@param {real} r`) and treat `@function` lines without a name as missing so synthetic metadata can supply it (see `test03.output.gml` and `test13.output.gml`).
2. Update `mergeSyntheticDocComments` so synthetic `@function` entries are inserted ahead of existing param lines rather than appended afterward (fixes ordering issues such as `test10.output.gml`).
3. Ensure the updated metadata prevents duplicate `@param` lines when an existing doc already covers the parameter (addresses the extra `@param r` in `test10.output.gml`).
:::

:::task-stub{title="Standardize doc comment type annotations"}
1. Add a normalization step in `src/plugin/src/printer/comments.js` (or a shared helper) that lowercases known GameMaker types (`Real`, `Bool`, etc.) and maps `void` to `undefined` when formatting doc lines.
2. Apply the normalization to both `@param` and `@returns` tags so fixtures such as `test03.output.gml` and `test10.output.gml` expect `real`/`undefined`.
3. Re-run `npm run test:plugin` from the repository root to ensure doc comment expectations pass.
:::

:::task-stub{title="Treat undefined defaults as optional in doc comments"}
1. Adjust `getParameterDocInfo` (and related helpers) in `src/plugin/src/printer/print.js` so `ConstructorDeclaration` parameters defaulting to `undefined` are marked optional without emitting `=undefined` (see `Shape` in `test10.output.gml`).
2. Ensure the same logic still omits the default text for ordinary functions that default to `undefined`.
3. Re-run `npm run test:plugin` from the repository root to confirm constructors now document `[color]` rather than `[color=undefined]`.
:::

:::task-stub{title="Rewrite argument\_count fallback patterns with numeric literals"}
1. Broaden `parseArgumentIndexValue` in `src/plugin/src/printer/print.js` to accept numeric literal AST nodes (not just stringified numbers) so the `argument_count > 0 ? argument[0] : ...` pattern is recognized.
2. Ensure the transformation in `preprocessFunctionArgumentDefaults` rewrites such cases to default parameters and removes the redundant `var` statements (see `test26.output.gml`).
3. Run `npm run test:plugin` from the repository root and verify the default-argument fixture passes.
:::

:::task-stub{title="Emit semicolons after do-until loops"}
1. Update the `DoUntilStatement` branch in `src/plugin/src/printer/print.js` to append the required trailing semicolon to the generated code.
2. Confirm the pretty-printer maintains existing formatting for the loop body while adding the `;` (see `test21.output.gml`).
3. Re-run `npm run test:plugin` from the repository root to ensure the do-until fixture matches.
:::

:::task-stub{title="Allow struct consolidation with inline comments"}
1. Enhance `consolidateStructAssignments` in `src/plugin/src/ast-transforms/consolidate-struct-assignments.js` so inline trailing comments on assignments (e.g., `stats.hp = 100; // base health`) do not block folding into the initial struct literal.
2. Preserve those comments by attaching them to the generated `Property` node so formatting in `test25.output.gml` matches the expected inline comment placement.
3. Re-run `npm run test:plugin` from the repository root to verify `trailing_comment` now prints as a consolidated struct.
:::

:::task-stub{title="Drop quotes for identifier-safe struct keys"}
1. When `consolidateStructAssignments` builds `Property` nodes, emit an `Identifier` node instead of a string literal when the property name is a valid identifier (e.g., `"beta"` → `beta`).
2. Ensure the printer keeps quotes for keys that require them, but removes them for cases like `make_struct` and `reuse_struct` in `test27.output.gml` and `dynamic_index` in `test25.output.gml`.
3. Re-run `npm run test:plugin` from the repository root and confirm the struct fixtures no longer show quoted keys.
:::
