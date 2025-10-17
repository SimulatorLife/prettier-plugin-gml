import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source, overrides = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...overrides
    });
}

test("omits synthetic docs for anonymous functions without return value", async () => {
    const source = "var myFunc = function() {\n    var value = 1;\n}\n";
    const formatted = await formatWithPlugin(source);
    const trimmed = formatted.trim();

    assert.match(
        trimmed,
        /^var myFunc = function\(\) \{/,
        "Synthetic doc comments should be omitted for anonymous functions."
    );
});

test("adds synthetic @returns doc for onymous/named functions without return value", async () => {
    const source = "function demo() {\n    var value = 1;\n}\n";
    const formatted = await formatWithPlugin(source);
    const trimmed = formatted.trim();

    assert.match(
        trimmed,
        /^\/\/\/ @function demo\n\/\/\/ @returns \{undefined\}\nfunction demo\(\) \{/,
        "Synthetic doc comments should describe undefined returns."
    );
});

test("adds synthetic @returns doc for empty onymous/named function bodies", async () => {
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
        "}",
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

test("adds synthetic @returns metadata for parameterless static functions", async () => {
    const source = [
        "function Example() constructor {",
        "    static ping = function() {",
        '        show_debug_message("ping");',
        "    };",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const trimmed = formatted.trim();

    assert.ok(
        trimmed.includes(
            "/// @function Example\nfunction Example() constructor {\n\n    /// @function ping\n    /// @returns {undefined}\n    static ping = function() {"
        ),
        "Expected synthetic doc comments to describe the parameterless static function with inserted @returns metadata."
    );
    assert.ok(
        trimmed.includes("/// @returns {undefined}"),
        "Synthetic doc comments should include @returns metadata for parameterless static functions without existing docs."
    );
});

test("updates existing @function tags to reflect static function names", async () => {
    const source = [
        "function Demo() constructor {",
        "    /// @function helper_wrong",
        "    static helper_right = function() {",
        "        return 1;",
        "    };",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source, {
        applyFeatherFixes: true
    });
    const lines = formatted.trim().split("\n");
    const helperIndex = lines.findIndex(
        (line) =>
            line.trimStart().startsWith("/// @function") &&
            line.includes("helper")
    );

    assert.notStrictEqual(
        helperIndex,
        -1,
        "Expected the formatted output to contain a @function doc comment."
    );
    assert.equal(
        lines[helperIndex].trim(),
        "/// @function helper_right",
        "Existing @function doc comments should be rewritten to describe the static function name."
    );
});

test("annotates overriding static functions with @override metadata", async () => {
    const source = [
        "function Base() constructor {",
        "    static print = function() {",
        '        show_debug_message("base");',
        "    };",
        "}",
        "",
        "function Derived() : Base() constructor {",
        "    static print = function() {",
        '        show_debug_message("derived");',
        "    };",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");
    const derivedIndex = lines.indexOf(
        "function Derived() : Base() constructor {"
    );

    assert.notStrictEqual(
        derivedIndex,
        -1,
        "Expected the derived constructor to be present in the formatted output."
    );

    let docStartIndex = derivedIndex + 1;
    while (docStartIndex < lines.length && lines[docStartIndex].trim() === "") {
        docStartIndex += 1;
    }

    const overrideLine = lines[docStartIndex];
    const functionLine = lines[docStartIndex + 1];
    const returnsLine = lines[docStartIndex + 2];

    assert.equal(
        overrideLine,
        "    /// @override",
        "Overriding static functions should include an @override tag."
    );
    assert.equal(
        functionLine,
        "    /// @function print",
        "Expected the synthetic doc comment to describe the static function name."
    );
    assert.equal(
        returnsLine,
        "    /// @returns {undefined}",
        "Overriding static functions should still receive synthesized @returns metadata."
    );
});

test("adds synthetic @returns metadata when defaults replace argument_count fallbacks", async () => {
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
        /returns \{undefined\}/.test(trimmed),
        "Argument fallback normalization should include synthetic @returns metadata."
    );
    assert.match(
        trimmed,
        /^\/\/\/ @function example\n\/\/\/ @param \[arg="default"\]\n\/\/\/ @returns \{undefined\}\nfunction example\(arg = "default"\) \{\}/,
        "Expected argument_count fallbacks to convert into default parameters and add @returns."
    );
});

test("reorders description doc comments between parameters and returns", async () => {
    const source = [
        "/// @function sample(_first, _second)",
        "/// @desc A longer example description that should wrap into multiple lines and appear after the",
        "/// @param {String Array[String]} _first First input",
        "/// @param {Id Instance} _second Second input",
        "function sample(_first, _second)",
        "{",
        "    show_debug_message(_first, _second);",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.deepStrictEqual(
        lines.slice(0, 6),
        [
            "/// @function sample",
            "/// @param {string,array[string]} first - First input",
            "/// @param {Id.Instance} second - Second input",
            "/// @description A longer example description that should wrap into multiple lines and appear after",
            "///              the",
            "/// @returns {undefined}"
        ],
        "Expected description doc comments to follow parameter metadata and precede the returns tag."
    );
});

test("respects wider printWidth when wrapping description doc comments", async () => {
    const source = [
        "/// @function sample(_first, _second)",
        "/// @desc A longer example description that should wrap into multiple lines and appear after the",
        "/// @param {String Array[String]} _first First input",
        "/// @param {Id Instance} _second Second input",
        "function sample(_first, _second)",
        "{",
        "    show_debug_message(_first, _second);",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source, { printWidth: 120 });
    const lines = formatted.trim().split("\n");

    assert.deepStrictEqual(
        lines.slice(0, 6),
        [
            "/// @function sample",
            "/// @param {string,array[string]} first - First input",
            "/// @param {Id.Instance} second - Second input",
            "/// @description A longer example description that should wrap into multiple lines and appear after",
            "///              the",
            "/// @returns {undefined}"
        ],
        "Description doc comments should clamp to the formatter's wrapping width even when printWidth is larger."
    );
});

test("wraps long description doc comments using the formatter cap", async () => {
    const source = [
        "/// @function sample(value)",
        "/// @description This synthetic doc comment should leave only the trailing connector on the continuation line when wrapping at the formatter cap for descriptions.",
        "function sample(value)",
        "{",
        "    show_debug_message(value);",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.deepStrictEqual(
        lines.slice(0, 5),
        [
            "/// @function sample",
            "/// @param value",
            "/// @description This synthetic doc comment should leave only the trailing connector on the",
            "///              continuation line when wrapping at the formatter cap for descriptions.",
            "/// @returns {undefined}"
        ],
        "Long description doc comments should wrap to the formatter cap rather than producing additional continuation lines."
    );
});
