import assert from "node:assert/strict";
import { test } from "node:test";
import prettier from "prettier";

const pluginModule = await import("../src/gml.js");

function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginModule],
        ...options
    });
}

test("reformats logical comparisons without introducing synthetic parentheses", async () => {
    const source = "if (i > 0 and i < 1) {\n    do_thing();\n}\n";
    const formatted = await format(source);

    assert.strictEqual(
        formatted,
        "if (i > 0 and i < 1) {\n    do_thing();\n}\n"
    );
});
