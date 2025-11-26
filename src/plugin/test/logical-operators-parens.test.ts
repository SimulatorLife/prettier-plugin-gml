import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

function format(source, options: any = {}) {
    return Plugin.format(source, options);
}

test("reformats logical comparisons without introducing synthetic parentheses", async () => {
    const source = "if (i > 0 and i < 1) {\n    do_thing();\n}\n";
    const formatted = await format(source);

    assert.strictEqual(
        formatted,
        "if (i > 0 and i < 1) {\n    do_thing();\n}\n"
    );
});

test("preserves explicit comparator grouping inside logical expressions", async () => {
    const source = "var myVal = (h < 0) or (h > 1);\n";
    const formatted = await format(source);

    assert.strictEqual(formatted, source);
});
