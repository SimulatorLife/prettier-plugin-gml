import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

test("promoted description blocks omit empty doc comment lines", async () => {
    const source = [
        "var ready = true;",
        "",
        "// / Emulation of string_height(), but using Scribble for calculating the width",
        "// /",
        "// / **Please do not use this function in conjunction with string_copy()**",
        "// /",
        "/// @param string    The string to draw",
        "",
        "function string_height_scribble(_string) {",
        "    return scribble(_string);",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const docLines = formatted
        .split("\n")
        .filter((line) => line.startsWith("///"));

    assert.ok(
        docLines.length > 0,
        "expected doc comment lines to be generated"
    );
    for (const line of docLines) {
        assert.notEqual(
            line.trim(),
            "///",
            "unexpected blank doc comment line"
        );
    }
});

test("doc comment promotion avoids blank line before first statement", async () => {
    const source = [
        "var ready = true;",
        "",
        "// / Emulation of string_height(), but using Scribble for calculating the width",
        "// /",
        "// / **Please do not use this function in conjunction with string_copy()**",
        "// /",
        "/// @param string    The string to draw",
        "",
        "function string_height_scribble(_string) {",
        "    static _scribble_state = __scribble_get_state();",
        "",
        "    return scribble(_string).starting_format(_scribble_state.__default_font, c_white).get_height();",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const lines = formatted.split("\n");
    const functionIndex = lines.findIndex((line) =>
        line.includes("function string_height_scribble")
    );

    assert.notEqual(
        functionIndex,
        -1,
        "expected formatted output to include the sample function"
    );

    const staticIndex = lines.findIndex(
        (line) =>
            line.trim() === "static _scribble_state = __scribble_get_state();"
    );

    assert.notEqual(
        staticIndex,
        -1,
        "expected formatted output to include the promoted static declaration"
    );

    assert.ok(
        staticIndex > functionIndex,
        "expected static declaration to appear after the function signature"
    );

    const betweenLines = lines.slice(functionIndex + 1, staticIndex);
    const hasBlankLine = betweenLines.some((line) => line.trim().length === 0);

    assert.equal(
        hasBlankLine,
        false,
        "expected no blank lines between function signature and first statement"
    );
});
