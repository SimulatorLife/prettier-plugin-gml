import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        convertDivisionToMultiplication: true
    });
}

test("flattens redundant multiplication parentheses when converting division", async () => {
    const source = "var r1 = (b.mass * m1) / 2;";

    const formatted = await format(source);

    assert.strictEqual(
        formatted,
        ["var r1 = b.mass * m1 * 0.5;", ""].join("\n")
    );
});
