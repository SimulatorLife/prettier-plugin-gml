import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });
}

test("adds synthetic @returns doc for functions without return value", async () => {
    const source = "function demo() {\n    var value = 1;\n}\n";
    const formatted = await formatWithPlugin(source);
    const trimmed = formatted.trim();

    assert.match(
        trimmed,
        /^\/\/\/ @function demo\n\/\/\/ @returns \{undefined\}\nfunction demo\(\) \{/,
        "Synthetic doc comments should describe undefined returns."
    );
});

test("adds synthetic @returns doc for empty function bodies", async () => {
    const source = "function noop() {}\n";
    const formatted = await formatWithPlugin(source);
    const trimmed = formatted.trim();

    assert.match(
        trimmed,
        /^\/\/\/ @function noop\n\/\/\/ @returns \{undefined\}\nfunction noop\(\) \{\}/,
        "Synthetic doc comments should annotate empty functions with undefined returns."
    );
});
