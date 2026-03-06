import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("indents wrapped string concatenation chains after variable assignment", async () => {
    const source = [
        String.raw`var str = "SMF demo 2: Interpolating between animations:\n" + "FPS: " + string(fps) + " FPS_real: " + string(fps_real) + "\n" + "Press E to enable sample interpolation.\n" + "Interpolation: " + (global.enableInterpolation ? "Enabled" : "Disabled");`,
        ""
    ].join("\n");

    const formatted = await Format.format(source, {
        printWidth: 120
    });

    assert.strictEqual(
        formatted,
        [
            "var str =",
            String.raw`    "SMF demo 2: Interpolating between animations:\n" +`,
            '    "FPS: " +',
            "    string(fps) +",
            '    " FPS_real: " +',
            "    string(fps_real) +",
            String.raw`    "\n" +`,
            String.raw`    "Press E to enable sample interpolation.\n" +`,
            '    "Interpolation: " +',
            '    (global.enableInterpolation ? "Enabled" : "Disabled");',
            ""
        ].join("\n")
    );
});
