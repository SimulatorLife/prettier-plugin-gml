import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

test("omits redundant parentheses around comparisons when using logical keywords", async () => {
    const source = [
        "if ((i > 0) and (i < 1)) {",
        "    return i;",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const expected = ["if (i > 0 and i < 1) {", "    return i;", "}", ""].join(
        "\n"
    );

    assert.strictEqual(
        formatted,
        expected,
        "Expected logical keyword formatting to avoid wrapping simple comparison branches in parentheses."
    );
});
