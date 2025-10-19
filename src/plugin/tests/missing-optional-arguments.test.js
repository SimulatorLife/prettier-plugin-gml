import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

const SOURCE_LINES = ["function demo() {", "    return func(1,,3);", "}", ""];

const DEFAULT_FORMATTED = [
    "",
    "/// @function demo",
    "function demo() {",
    "    return func(1, undefined, 3);",
    "}",
    ""
].join("\n");

test("prints undefined for missing optional arguments by default", async () => {
    const formatted = await format(SOURCE_LINES.join("\n"));

    assert.strictEqual(formatted, DEFAULT_FORMATTED);
});

test("plugin no longer exposes removed options", async () => {
    const pluginModule = await import(pathToFileURL(pluginPath).href);

    for (const optionName of [
        "missingOptionalArgumentPlaceholder",
        "allowTrailingCallArguments"
    ]) {
        assert.ok(
            !Object.hasOwn(pluginModule.options, optionName),
            `${optionName} must be absent from plugin metadata`
        );
        assert.ok(
            !Object.hasOwn(pluginModule.defaultOptions, optionName),
            `${optionName} must be absent from plugin defaults`
        );
    }
});
