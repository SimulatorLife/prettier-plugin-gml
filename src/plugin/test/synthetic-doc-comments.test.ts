import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("omits synthetic docs for anonymous functions without return value", async () => {
    const source = "var myFunc = function() {\n    var value = 1;\n}\n";
    const formatted = await Plugin.format(source);
    const trimmed = formatted.trim();

    assert.match(
        trimmed,
        /^var myFunc = function\(\) \{/,
        "Synthetic doc comments should be omitted for anonymous functions."
    );
});

void test("omits synthetic docs for anonymous functions with return value", async () => {
    const source = "var myFunc = function() {\n    return 1;\n}\n";
    const formatted = await Plugin.format(source, { applyFeatherFixes: true });
    const trimmed = formatted.trim();

    assert.match(
        trimmed,
        /^var myFunc = function\(\) \{/,
        "Synthetic doc comments should be omitted for anonymous functions."
    );
});

void test("adds synthetic @returns doc for onymous/named functions without return value", async () => {
    const source = "function demo() {\n    var value = 1;\n}\n";
    const formatted = await Plugin.format(source);
    const trimmed = formatted.trim();

    assert.match(
        trimmed,
        /^\/\/\/ @returns \{undefined\}\nfunction demo\(\) \{/,
        "Synthetic doc comments should describe undefined returns without deprecated tags."
    );
});

void test("separates synthetic doc comments from preceding line comments", async () => {
    const source = [
        "// Scenario 2",
        "function scr_custom_gpu_func() {",
        "    gpu_push_state();",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");

    assert.deepStrictEqual(
        lines.slice(0, 4),
        [
            "// Scenario 2",
            "",
            "/// @returns {undefined}",
            "function scr_custom_gpu_func() {"
        ],
        "Synthetic doc comments should be separated from preceding line comments by a blank line."
    );
});

void test("adds synthetic @returns doc for empty onymous/named function bodies", async () => {
    const source = "function noop() {}\n";
    const formatted = await Plugin.format(source);
    const trimmed = formatted.trim();

    assert.match(
        trimmed,
        /^\/\/\/ @returns \{undefined\}\nfunction noop\(\) \{\}/,
        "Synthetic doc comments should annotate empty functions with undefined returns."
    );
});

void test("augments static function doc comments with missing @returns metadata", async () => {
    const source = [
        "/// @function helper",
        "static helper = function() {",
        "    var value = 0;",
        "    value += 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const trimmed = formatted.trim();

    assert.match(
        trimmed,
        /^\/\/\/ @returns \{undefined\}\nstatic helper = function\(\) \{/,
        "Static function doc comments should receive synthesized @returns metadata."
    );
});

void test("adds synthetic @returns metadata for parameterless static functions", async () => {
    const source = [
        "function Example() constructor {",
        "    static ping = function() {",
        '        show_debug_message("ping");',
        "    };",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const trimmed = formatted.trim();

    assert.ok(
        trimmed.includes(
            "\n\n    /// @returns {undefined}\n    static ping = function() {"
        ),
        "Expected synthetic doc comments to describe the parameterless static function with inserted @returns metadata."
    );
    assert.ok(
        trimmed.includes("/// @returns {undefined}"),
        "Synthetic doc comments should include @returns metadata for parameterless static functions without existing docs."
    );
    assert.ok(
        !trimmed.includes("/// @function Example"),
        "Synthetic doc comments should no longer produce deprecated @function tags."
    );
});

void test("adds synthetic docs for named constructor assignments", async () => {
    const source = [
        "item = function() constructor {",
        "    value = 1;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");

    assert.strictEqual(
        lines[0],
        "item = function() constructor {",
        "Named constructor assignments should no longer receive deprecated @function doc comments."
    );
    assert.ok(
        !lines.some((line) => line.includes("/// @function item")),
        "Named constructor assignments should not emit synthetic @function tags."
    );
});

void test("synthetic constructor docs include trailing parameters", async () => {
    const source = [
        "function child(_foo, _value) constructor {",
        "    value = _value;",
        "}",
        "",
        "function grandchild(_foo, _value, _bar) : child(_foo, _value) constructor {",
        "    bar = _bar;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");
    const functionIndex = lines.indexOf(
        "function grandchild(_foo, _value, _bar) : child(_foo, _value) constructor {"
    );

    assert.notStrictEqual(
        functionIndex,
        -1,
        "Expected the formatted output to include the grandchild constructor."
    );

    const docLines: string[] = [];
    for (let index = functionIndex - 1; index >= 0; index -= 1) {
        const line = lines[index].trim();
        if (line.startsWith("///")) {
            docLines.unshift(line);
            continue;
        }
        if (line === "") {
            continue;
        }
        break;
    }

    const paramLines = docLines.filter((line) => line.startsWith("/// @param"));

    assert.deepStrictEqual(
        paramLines,
        ["/// @param foo", "/// @param value", "/// @param bar"],
        "Synthetic constructor docs should include entries for trailing parameters."
    );
});

void test("annotates overriding static functions with @override metadata", async () => {
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

    const formatted = await Plugin.format(source);
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
    const returnsLine = lines[docStartIndex + 1];

    assert.equal(
        overrideLine,
        "    /// @override",
        "Overriding static functions should include an @override tag."
    );
    assert.equal(
        returnsLine,
        "    /// @returns {undefined}",
        "Overriding static functions should still receive synthesized @returns metadata."
    );
});

void test("adds synthetic @returns metadata when defaults replace argument_count fallbacks", async () => {
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

    const formatted = await Plugin.format(source);
    const trimmed = formatted.trim();

    assert.ok(
        /returns \{undefined\}/.test(trimmed),
        "Argument fallback normalization should include synthetic @returns metadata."
    );
    assert.match(
        trimmed,
        /^\/\/\/ @param \[arg="default"\]\n\/\/\/ @returns \{undefined\}\nfunction example\(arg = "default"\) \{\}/,
        "Expected argument_count fallbacks to convert into default parameters and add @returns without deprecated tags."
    );
});

void test("reorders description doc comments between parameters and returns", async () => {
    const source = [
        "/// @function sample(_first, _second)",
        "/// @desc A longer example description that should wrap into multiple lines and appear before the the parameter metadata.",
        "/// @param {String Array[String]} _first First input",
        "/// @param {Id Instance} _second Second input",
        "function sample(_first, _second)",
        "{",
        "    show_debug_message(_first, _second);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, { printWidth: 100 });
    const lines = formatted.trim().split("\n");

    assert.deepStrictEqual(
        lines.slice(0, 6),
        [
            "/// @description A longer example description that should wrap into multiple lines and appear before",
            "///              the parameter metadata.",
            "/// @param {string,array<string>} first First input",
            "/// @param {Id.Instance} second Second input",
            "/// @returns {undefined}",
            "function sample(_first, _second) {"
        ],
        "Expected description doc comments to precede parameter metadata and the returns tag."
    );
});

void test("omits alias-style description doc comments when synthetic metadata is emitted", async () => {
    const source = [
        "/// @description sample_alias(arg0, arg1)",
        "/// @param arg0",
        "/// @param arg1",
        "function sample_alias(argument0, argument1)",
        "{",
        "    return argument0 + argument1;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");

    assert.ok(
        lines.includes("/// @description sample_alias(arg0, arg1)"),
        "Alias-style description entries should be preserved when synthetic metadata is disabled."
    );
    assert.ok(
        !lines.some((line) => line.startsWith("/// @function sample_alias")),
        "Synthetic doc comments should no longer insert deprecated @function tags."
    );
});

void test("respects printWidth for wrapping description doc comments", async () => {
    const source = [
        "/// @function sample(_first, _second)",
        "/// @desc A longer example description that is still under the printWidth should not wrap at all",
        "/// @param {String Array[String]} _first First input",
        "/// @param {Id Instance} _second Second input",
        "function sample(_first, _second)",
        "{",
        "    show_debug_message(_first, _second);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, { printWidth: 120 });
    const lines = formatted.trim().split("\n");

    assert.deepStrictEqual(
        lines.slice(0, 6),
        [
            "/// @description A longer example description that is still under the printWidth should not wrap at all",
            "/// @param {string,array<string>} first First input",
            "/// @param {Id.Instance} second Second input",
            "/// @returns {undefined}",
            "function sample(_first, _second) {"
        ],
        "Description doc comments should not wrap when under the printWidth limit."
    );
});

void test("wraps long description doc comments using the formatter cap", async () => {
    const source = [
        "/// @function sample(value)",
        "/// @description This synthetic doc comment should leave only the trailing connector on the continuation line when wrapping at the formatter cap for descriptions.",
        "function sample(value)",
        "{",
        "    show_debug_message(value);",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, { printWidth: 95 });
    const lines = formatted.trim().split("\n");

    assert.deepStrictEqual(
        lines.slice(0, 5),
        [
            "/// @description This synthetic doc comment should leave only the trailing connector on the",
            "///              continuation line when wrapping at the formatter cap for descriptions.",
            "/// @param value",
            "/// @returns {undefined}",
            "function sample(value) {"
        ],
        "Long description doc comments should wrap to the formatter cap rather than producing additional continuation lines."
    );
});
