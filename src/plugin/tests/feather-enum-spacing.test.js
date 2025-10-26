import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

const source = [
    "enum First {",
    '    A = "0",',
    '    B = "1"',
    "}",
    "",
    "enum Second {",
    '    VALUE = "2"',
    "}",
    "",
    "// marker",
    "enum Third {",
    '    FINAL = "3"',
    "}",
    ""
].join("\n");

test("preserves blank lines between sanitized enums when Feather fixes normalize initializers", async () => {
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        applyFeatherFixes: true
    });

    assert.match(
        formatted,
        /}\n\nenum Second \{/,
        "Expected a blank line between the first and second enums."
    );

    assert.match(
        formatted,
        /marker\n\nenum Third \{/,
        "Expected a blank line between the comment marker and the third enum."
    );
});
