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

test("inserts a blank line between top-level enum declarations", async () => {
    const source = [
        "enum First {",
        "    one = 1,",
        "    two",
        "}",
        "",
        "enum Second {",
        "    value = 2",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines[4],
        "",
        "Expected a blank line between consecutive top-level enum declarations."
    );
});

test("does not align enum initializers when only some members declare values", async () => {
    const source = [
        "enum Mixed {",
        "    short = 1,",
        "    longer = 2,",
        "    trailing",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.equal(
        lines[1],
        "    short = 1,",
        "Expected enum members with initializers to keep a single space before '='."
    );
    assert.equal(
        lines[2],
        "    longer = 2,",
        "Expected initializer alignment to be skipped when not all members declare values."
    );
});
