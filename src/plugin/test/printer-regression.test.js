import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source) {
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    return formatted;
}

test("prints statements and element lists for GML programs", async () => {
    const source = [
        "var counter = 1 + value;",
        "function demo() {",
        "    var total = add(counter, 2, 3);",
        "    return total;",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source);

    assert.strictEqual(
        formatted,
        [
            "var counter = 1 + value;",
            "",
            "/// @function demo",
            "function demo() {",
            "    var total = add(counter, 2, 3);",
            "    return total;",
            "}",
            ""
        ].join("\n")
    );
});

test("prints all call arguments in order", async () => {
    const source = [
        "function demo() {",
        '    return calculate("alpha", 2, true, other());',
        "}",
        ""
    ].join("\n");

    const formatted = await format(source);

    assert.strictEqual(
        formatted,
        [
            "",
            "/// @function demo",
            "function demo() {",
            '    return calculate("alpha", 2, true, other());',
            "}",
            ""
        ].join("\n")
    );
});
