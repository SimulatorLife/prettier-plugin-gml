import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { performance } from "node:perf_hooks";
import { TRAILING_MACRO_SEMICOLON_PATTERN } from "../../src/transforms/feather/apply-feather-fixes.js";

void describe("TRAILING_MACRO_SEMICOLON_PATTERN", () => {
    void it("removes trailing semicolons correctly", () => {
        const cases = [
            { input: ";", expected: "" },
            { input: "; // comment", expected: " // comment" },
            { input: "; /* comment */", expected: " /* comment */" },
            { input: ";   // comment", expected: "   // comment" },
            { input: "; /* c1 */ /* c2 */", expected: " /* c1 */ /* c2 */" },
            { input: "; /* c1 */ // c2", expected: " /* c1 */ // c2" },
            { input: ";\n", expected: "\n" },
            { input: "; // comment\n", expected: " // comment\n" },
            { input: "; var x = 1;", expected: "; var x = 1" }, // Should remove the LAST semicolon
            { input: "; /* */ x", expected: "; /* */ x" } // Should NOT remove the first semicolon
        ];

        for (const { input, expected } of cases) {
            const actual = input.replace(TRAILING_MACRO_SEMICOLON_PATTERN, "");
            assert.equal(
                actual,
                expected,
                `Expected "${input}" to become "${expected}", got "${actual}"`
            );
        }
    });

    void it("avoids ReDoS on pathological inputs", () => {
        const start = performance.now();
        // This string previously caused exponential backtracking
        const pathological = `; //${" ".repeat(50_000)}\rA`;
        const result = TRAILING_MACRO_SEMICOLON_PATTERN.test(pathological);
        assert.equal(result, false);
        const end = performance.now();

        assert.ok(end - start < 100, "Regex should not be exponential");
    });
});
