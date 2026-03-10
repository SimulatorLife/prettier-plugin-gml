/**
 * Enforces the formatter/linter boundary (target-state.md §2.1, §3.2, §3.5):
 *
 * The formatter must not perform semantic/content rewrites involving `global.`
 * prefix manipulation. Specifically, the following functions were removed because
 * they violated the formatter boundary by walking the AST for `globalvar`
 * declarations and adding or stripping `global.` prefixes:
 *
 * - `ensurePreservedGlobalVarNames`: collected `globalvar`-declared names from
 *   the AST — a semantic analysis pass that belongs in `@gml-modules/lint`.
 * - `collectGlobalVarNamesFromNode`: recursive AST walker for the above.
 * - `shouldPrefixGlobalIdentifier`: added a `global.` prefix to bare identifiers
 *   tagged with `isGlobalIdentifier` — a semantic content rewrite.
 * - The `global.`-stripping branch in `printMemberDotExpressionNode`: stripped
 *   `global.` from `global.<name>` expressions when the name was `globalvar`-
 *   declared — another semantic content rewrite.
 * - `PRESERVED_GLOBAL_VAR_NAMES` symbol: was only used by the above dead code.
 *
 * These tests guard against silent re-introduction of this dormant semantic
 * transform logic into the format workspace (target-state.md §3.5).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Format } from "../src/index.js";
import * as Constants from "../src/printer/constants.js";

void describe("global identifier prefix boundary (target-state.md §2.1, §3.2, §3.5)", () => {
    void it("constants module does not export PRESERVED_GLOBAL_VAR_NAMES symbol", () => {
        // The PRESERVED_GLOBAL_VAR_NAMES Symbol was used exclusively as a cache
        // key for the dormant globalvar-collection pass. Its presence in the
        // constants module signals that semantic AST-walk logic may still exist
        // in the formatter. It must not be re-introduced.
        assert.ok(
            !("PRESERVED_GLOBAL_VAR_NAMES" in Constants),
            "PRESERVED_GLOBAL_VAR_NAMES must not be exported from constants.ts — " +
                "it was used only by dormant semantic-rewrite logic that violates target-state.md §2.1"
        );
    });

    void it("preserves globalvar identifier verbatim and does not add global. prefix", async () => {
        // The formatter must not add a `global.` prefix to identifiers that
        // are declared via `globalvar`. That is a semantic content rewrite
        // that belongs in `@gml-modules/lint`.
        const source = ["globalvar score;", "score = 100;"].join("\n");

        const formatted = await Format.format(source);

        assert.match(
            formatted,
            /^score = 100;$/m,
            "Formatter must not add `global.` prefix to globalvar-declared identifiers (target-state.md §2.1, §3.2)"
        );
        assert.doesNotMatch(
            formatted,
            /global\.score/,
            "Formatter must not rewrite bare `score` to `global.score` — that is a semantic content rewrite (target-state.md §3.2)"
        );
    });

    void it("preserves global.xxx member dot expressions verbatim and does not strip global. prefix", async () => {
        // The formatter must not strip `global.` from a `global.name` expression
        // when the name happens to be declared via `globalvar` in the same file.
        // That is a semantic content rewrite that belongs in `@gml-modules/lint`.
        const source = ["globalvar score;", "global.score = 100;"].join("\n");

        const formatted = await Format.format(source);

        assert.match(
            formatted,
            /^global\.score = 100;$/m,
            "Formatter must preserve `global.score` verbatim and not strip the `global.` prefix (target-state.md §2.1, §3.2)"
        );
    });

    void it("does not distinguish between globalvar-declared and ordinary identifiers during formatting", async () => {
        // When both an ordinary identifier and a globalvar-declared identifier
        // appear in the same file, the formatter must treat them identically
        // (both printed verbatim). No semantic classification should affect layout.
        const source = [
            "globalvar global_counter;",
            "var local_counter = 0;",
            "global_counter = 1;",
            "local_counter = 2;"
        ].join("\n");

        const formatted = await Format.format(source);

        assert.match(
            formatted,
            /^global_counter = 1;$/m,
            "Formatter must print the globalvar-declared name verbatim with no prefix added (target-state.md §3.2)"
        );
        assert.match(
            formatted,
            /^local_counter = 2;$/m,
            "Formatter must print the local identifier verbatim (control case)"
        );
        assert.doesNotMatch(
            formatted,
            /global\.global_counter/,
            "Formatter must not synthesize a `global.` prefix for globalvar identifiers (target-state.md §2.1)"
        );
    });
});
