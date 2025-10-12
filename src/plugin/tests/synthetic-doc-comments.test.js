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

test("augments static function doc comments with missing @returns metadata", async () => {
    const source = [
        "/// @function helper",
        "static helper = function() {",
        "    var value = 0;",
        "    value += 1;",
        "};",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const trimmed = formatted.trim();

    assert.match(
        trimmed,
        /^\/\/\/ @function helper\n\/\/\/ @returns \{undefined\}\nstatic helper = function\(\) \{/,
        "Static function doc comments should receive synthesized @returns metadata."
    );
});

test("omits synthetic @returns metadata when defaults replace argument_count fallbacks", async () => {
    const source = [
        "function example(arg) {",
        "    if (argument_count > 0) {",
        "        arg = argument[0];",
        "    } else {",
        '        arg = "default";',
        "    }",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const trimmed = formatted.trim();

    assert.ok(
        !/returns \{undefined\}/.test(trimmed),
        "Argument fallback normalization should not emit synthetic @returns metadata."
    );
    assert.match(
        trimmed,
        /^\/\/\/ @function example\n\/\/\/ @param \[arg="default"\]\nfunction example\(arg = "default"\) \{\}/,
        "Expected argument_count fallbacks to convert into default parameters without adding @returns."
    );
});
