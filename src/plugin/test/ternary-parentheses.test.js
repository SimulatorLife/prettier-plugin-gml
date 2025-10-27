import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

test("wraps ternary initializers in parentheses", async () => {
    const source = ['var myVal13 = (3 - 2) ? "cool" : "not cool";', ""].join(
        "\n"
    );

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const expected = [
        'var myVal13 = ((3 - 2) ? "cool" : "not cool");',
        ""
    ].join("\n");

    assert.strictEqual(
        formatted,
        expected,
        "Expected ternary variable initializers to be wrapped in parentheses."
    );
});
