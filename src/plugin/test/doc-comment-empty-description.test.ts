import assert from "node:assert/strict";
import { Plugin } from "../src/index.js";
import { test } from "node:test";

const format = (source, options = {}) => Plugin.format(source, options);

void test("omits empty doc descriptions on struct static functions", async () => {
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
        docLines.includes("/// @returns {undefined}"),
        "Expected struct static functions to still include their synthetic @returns metadata."
    );
});
