import assert from "node:assert/strict";
import prettier from "prettier";
import { test } from "node:test";

const pluginPath = new URL("../src/gml.js", import.meta.url);

test("struct static functions include @function doc tags", async () => {
    const source = `function container() constructor {
    /// @description Example
    /// @returns {undefined}
    static print = function() {
        return;
    };
}`;

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const docLines = formatted
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("///"));

    assert.ok(
        docLines.includes("/// @function print"),
        "Expected struct static function docs to include a @function tag."
    );
});

test("struct static function descriptions follow the @function tag", async () => {
    const source = `function container() constructor {
    /// @description Example description
    /// @method print
    /// @returns {undefined}
    static print = function() {
        return;
    };
}`;

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const docLines = formatted
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("///"));

    const functionIndex = docLines.indexOf("/// @function print");
    const descriptionIndex = docLines.indexOf(
        "/// @description Example description"
    );

    assert.ok(functionIndex !== -1, "Expected to include a @function tag.");
    assert.ok(
        descriptionIndex !== -1,
        "Expected to include the normalized @description line."
    );
    assert.ok(
        functionIndex < descriptionIndex,
        "Expected the @description line to follow the @function tag."
    );
});
