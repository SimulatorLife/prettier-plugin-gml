import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
}

test("adds undefined defaults for trailing optional parameters", async () => {
    const formatted = await format(
        [
            "function demo(first, second = 1, third) {",
            "    return [first, second, third];",
            "}",
            ""
        ].join("\n")
    );

    const signatureLine = formatted
        .split("\n")
        .find((line) => line.startsWith("function demo("));

    assert.strictEqual(
        signatureLine,
        "function demo(first, second = 1, third = undefined) {"
    );
});
