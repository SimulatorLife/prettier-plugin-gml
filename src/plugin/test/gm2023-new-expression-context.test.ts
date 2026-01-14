/**
 * Test that GM2023 (function call argument order) fix does not extract
 * nested call arguments when the containing call is within a NewExpression.
 *
 * CONTEXT: GM2023 warns about evaluation order of multiple function calls
 * in an argument list. However, when a function call is the sole or primary
 * argument to a constructor (NewExpression), extraction is not beneficial
 * and breaks the natural code grouping.
 *
 * EXPECTED BEHAVIOR: Calls like `new ColmeshBlock(scr_matrix_build(round(x), ...))`
 * should NOT have the nested calls extracted, even though `scr_matrix_build`
 * has multiple function call arguments.
 */

import { test } from "node:test";
import { strictEqual } from "node:assert";
import { Plugin } from "../src/index.js";

void test("GM2023 does not extract from calls nested in NewExpression", async () => {
    const input = `
colmesh_shape = new ColmeshBlock(scr_matrix_build(round(x), round(y), round(z - 2), 0, 0, 0, max(ceil(sprite_width * 0.5), 10), 4, max(32, sprite_height + 2)));
`.trim();

    const formatted = await Plugin.format(input, {
        parser: "gml-parse",
        applyFeatherFixes: true,
        printWidth: 200
    });

    // The formatted output should NOT contain temporary variable declarations
    // like `var __feather_call_arg_0 = round(x);`
    const hasTempVars = formatted.includes("__feather_call_arg") || formatted.includes("__featherFix");

    strictEqual(
        hasTempVars,
        false,
        `GM2023 should not extract arguments from calls nested in NewExpression. Got:\n${formatted}`
    );

    // The new expression should remain on a single logical line (though it may wrap)
    const hasNewExpression = formatted.includes("new ColmeshBlock");
    strictEqual(hasNewExpression, true, "NewExpression should remain intact in the output");
});
