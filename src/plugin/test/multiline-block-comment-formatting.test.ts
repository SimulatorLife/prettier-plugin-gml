import assert from "node:assert";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

void describe("multi-line block comment formatting", () => {
    void it("formats multi-line block comments with * prefix on each line", async () => {
        const input = `/*
This is a multi-line comment
It continues on this line
Woah, still going
Almost done!
*/

var x = 1;`;

        const expected = `

/*
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

        const expected = `

/*
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
});
