import assert from "node:assert/strict";
import prettier from "prettier";
import { test } from "node:test";

const pluginPath = new URL("../src/gml.js", import.meta.url);

const format = (source, options = {}) =>
    prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });

test("omits empty doc descriptions on struct static functions", async () => {
    const source = [
        "function container() constructor {",
        "    /// @description",
        "    /// @returns {undefined}",
        "    static print = function() {",
        "        return;",
        "    };",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source);
    const docLines = formatted
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("///"));

    assert.ok(
        !docLines.includes("/// @description"),
        "Expected empty @description lines to be removed from struct static docs."
    );
    assert.ok(
        docLines.filter((line) => line === "/// @function print").length === 1,
        "Expected to preserve the struct static function doc tag."
    );
});
