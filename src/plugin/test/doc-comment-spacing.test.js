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

    assert.ok(docLines.length > 0, "expected doc comment lines to be generated");
    for (const line of docLines) {
        assert.notEqual(line.trim(), "///", "unexpected blank doc comment line");
    }
});
