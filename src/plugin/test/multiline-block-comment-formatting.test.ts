import assert from "node:assert";
import { describe, it } from "node:test";

import { normalizeFormattedOutput, Plugin } from "../src/index.js";

void describe("multi-line block comment formatting", () => {
    void it("formats multi-line block comments with * prefix on each line", async () => {
        const input = `/*
This is a multi-line comment
It continues on this line
Woah, still going
Almost done!
*/

var x = 1;`;

        const expected = `/*
 * This is a multi-line comment
 * It continues on this line
 * Woah, still going
 * Almost done!
 */

var x = 1;
`;

        const formatted = await Plugin.format(input, { parser: "gml" });
        assert.strictEqual(formatted, expected);
    });

    void it("filters out empty lines from multi-line block comments", async () => {
        const input = `/*

This is a comment with empty lines

And another line

*/

var x = 1;`;

        const expected = `/*
 * This is a comment with empty lines
 * And another line
 */

var x = 1;
`;

        const formatted = await Plugin.format(input, { parser: "gml" });
        assert.strictEqual(formatted, expected);
    });

    void it("preserves single-line block comments as-is", async () => {
        const input = `/* This is a single-line comment */
var x = 1;`;

        const expected = `/* This is a single-line comment */
var x = 1;
`;

        const formatted = await Plugin.format(input, { parser: "gml" });
        assert.strictEqual(formatted, expected);
    });

    void it("inserts blank line before top-level line comment following a single-line block comment", () => {
        // Regression: updateBlockCommentState incorrectly treated /* ... */ as
        // opening a block comment, causing the following top-level // comment
        // to be skipped for blank-line insertion.
        const input = "/* single-line block comment */\n// top-level line comment\nfunction foo() {}\n";

        const normalized = normalizeFormattedOutput(input);

        assert.ok(
            normalized.includes("*/\n\n//"),
            `Expected a blank line between the block comment and the top-level line comment.\nActual output:\n${normalized}`
        );
    });

    void it("deduplicates doc-comment lines following a single-line block comment", () => {
        // Regression: updateBlockCommentState incorrectly treated /* ... */ as
        // opening a block comment, preventing doc-line deduplication for lines
        // that immediately follow.
        const input = "/* helper */\n/// @description Foo\n/// @description Foo\nfunction foo() {}\n";

        const normalized = normalizeFormattedOutput(input);
        const docLineCount = (normalized.match(/\/\/\/ @description Foo/g) ?? []).length;

        assert.strictEqual(
            docLineCount,
            1,
            `Expected duplicate doc line to be deduplicated.\nActual output:\n${normalized}`
        );
    });
});
