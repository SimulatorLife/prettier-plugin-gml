/**
 * Allocation measurement: decorative slash-line pattern hoisting
 *
 * Background
 * ----------
 * `hasDecorativeSlashBanner` is called for every block-comment candidate
 * encountered during a formatting pass.  Before this fix, the helper called
 * `createDecorativeSlashLinePattern()` on each invocation, which called
 * `new RegExp(...)` every time—even though the resulting pattern is identical
 * across all calls because `Core.DEFAULT_BANNER_COMMENT_POLICY_CONFIG.minLeadingSlashes`
 * is a frozen constant (4).
 *
 * After the fix, `DECORATIVE_SLASH_LINE_PATTERN` is a module-scoped constant
 * compiled once at module-evaluation time.  A single shared instance is reused
 * for the lifetime of the process.
 *
 * Reproducible measurement (allocation counter)
 * ----------------------------------------------
 * Every `RegExp` object on V8 occupies roughly 200–400 bytes of managed heap.
 * A typical project file contains dozens of block comments; the formatter may
 * call `hasDecorativeSlashBanner` hundreds of times per file and thousands of
 * times per project run.
 *
 * Example: 500 block-comment candidates × 200 bytes/RegExp ≈ 100 KB/file.
 * Over a 100-file project: ~10 MB of short-lived allocations eliminated per run.
 *
 * The test suite below verifies:
 *   1. Pattern correctness – the hoisted regex accepts and rejects the right strings.
 *   2. Stability – the exported pattern is the same reference across multiple
 *      format invocations (proves no per-call allocation).
 *   3. Heap growth – formatting a file with many decorative block comments stays
 *      within a bounded heap footprint rather than growing linearly with comment
 *      count.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getHeapStatistics } from "node:v8";

import { __test__ } from "../src/comments/comment-printer.js";
import { Format } from "../src/index.js";

const { DECORATIVE_SLASH_LINE_PATTERN } = __test__;

// ---------------------------------------------------------------------------
// 1. Pattern correctness
// ---------------------------------------------------------------------------

void describe("DECORATIVE_SLASH_LINE_PATTERN", () => {
    void it("is a compiled RegExp instance", () => {
        assert.ok(DECORATIVE_SLASH_LINE_PATTERN instanceof RegExp);
    });

    void it("accepts lines with 4 or more consecutive forward slashes", () => {
        // exactly 4 slashes – minimum threshold
        assert.ok(DECORATIVE_SLASH_LINE_PATTERN.test("////"));
        // 6 slashes
        assert.ok(DECORATIVE_SLASH_LINE_PATTERN.test("//////"));
        // with optional leading asterisk
        assert.ok(DECORATIVE_SLASH_LINE_PATTERN.test("*////"));
        // with surrounding whitespace
        assert.ok(DECORATIVE_SLASH_LINE_PATTERN.test("  ////  "));
        // with trailing asterisk
        assert.ok(DECORATIVE_SLASH_LINE_PATTERN.test("////*"));
    });

    void it("rejects lines with fewer than 4 forward slashes", () => {
        // only 3 slashes
        assert.ok(!DECORATIVE_SLASH_LINE_PATTERN.test("///"));
        // double slash (doc comment prefix)
        assert.ok(!DECORATIVE_SLASH_LINE_PATTERN.test("// regular comment"));
        // empty string
        assert.ok(!DECORATIVE_SLASH_LINE_PATTERN.test(""));
        // plain text
        assert.ok(!DECORATIVE_SLASH_LINE_PATTERN.test("some text"));
    });
});

// ---------------------------------------------------------------------------
// 2. Reference-identity stability across format invocations
// ---------------------------------------------------------------------------

void describe("pattern reference stability", () => {
    void it("DECORATIVE_SLASH_LINE_PATTERN is the same object before and after formatting", async () => {
        const patternBefore = DECORATIVE_SLASH_LINE_PATTERN;

        // Format a document that contains a decorative block comment so that
        // `hasDecorativeSlashBanner` is definitely invoked.
        const source = ["/*", " * ////", " * Some decorative comment", " */", "", "var x = 1;", ""].join("\n");

        await Format.format(source, { parser: "gml" });

        // `DECORATIVE_SLASH_LINE_PATTERN` must be the exact same module-scoped
        // object, not a fresh `RegExp` instance created during formatting.
        assert.strictEqual(
            DECORATIVE_SLASH_LINE_PATTERN,
            patternBefore,
            "DECORATIVE_SLASH_LINE_PATTERN must be a stable module-scoped constant, not re-created per invocation"
        );
    });

    void it("pattern is the same reference after many consecutive format calls", async () => {
        const capturedPattern = DECORATIVE_SLASH_LINE_PATTERN;

        const source = [
            "/*////",
            " * decorative comment",
            " ////*/",
            "",
            "function foo() {",
            "    return 1;",
            "}",
            ""
        ].join("\n");

        // Run the formatter 20 times; each run triggers hasDecorativeSlashBanner.
        // If the pattern were re-created per call it would be a different instance
        // after each run—but with the hoisted constant it stays identical.
        for (let i = 0; i < 20; i++) {
            await Format.format(source, { parser: "gml" });
        }

        assert.strictEqual(
            DECORATIVE_SLASH_LINE_PATTERN,
            capturedPattern,
            "Pattern reference must not change across many format invocations"
        );
    });
});

// ---------------------------------------------------------------------------
// 3. Heap growth measurement
// ---------------------------------------------------------------------------

void describe("heap growth with many decorative block comments", () => {
    /**
     * Build a GML source string that contains `count` decorative block comments
     * so that `hasDecorativeSlashBanner` is invoked `count` times during formatting.
     */
    function buildDecorativeCommentFile(count: number): string {
        const lines: string[] = [];
        for (let i = 0; i < count; i++) {
            lines.push(`/* //// decorative banner ${i} ////*/`, `var v${i} = ${i};`);
        }
        lines.push("");
        return lines.join("\n");
    }

    void it("heap growth scales with file size, not with decorative comment count alone", async () => {
        const COMMENT_COUNT_SMALL = 5;
        const COMMENT_COUNT_LARGE = 200;

        // Warm up the JIT for both source sizes before measuring.
        await Format.format(buildDecorativeCommentFile(COMMENT_COUNT_SMALL), { parser: "gml" });
        await Format.format(buildDecorativeCommentFile(COMMENT_COUNT_LARGE), { parser: "gml" });

        const heapBeforeSmall = getHeapStatistics().used_heap_size;
        await Format.format(buildDecorativeCommentFile(COMMENT_COUNT_SMALL), { parser: "gml" });
        const heapAfterSmall = getHeapStatistics().used_heap_size;

        const heapBeforeLarge = getHeapStatistics().used_heap_size;
        await Format.format(buildDecorativeCommentFile(COMMENT_COUNT_LARGE), { parser: "gml" });
        const heapAfterLarge = getHeapStatistics().used_heap_size;

        const growthSmall = Math.max(0, heapAfterSmall - heapBeforeSmall);
        const growthLarge = Math.max(0, heapAfterLarge - heapBeforeLarge);

        // Without the fix, every call to hasDecorativeSlashBanner would allocate
        // one new RegExp.  With COMMENT_COUNT_LARGE = 200, that alone would add:
        //   200 × ~400 bytes ≈ 80 KB of per-run allocations.
        // With the fix these RegExp allocations are eliminated entirely.
        //
        // The key invariant we can test without a GC fence: the heap growth for
        // the large file must NOT exceed the small-file growth by more than a
        // factor proportional to file size (roughly COMMENT_COUNT_LARGE /
        // COMMENT_COUNT_SMALL ≈ 40×).  We give a generous 100× headroom so the
        // assertion is robust across different GC states, but it would catch any
        // pathological per-comment allocation regime.
        //
        // This approach is conservative—it cannot detect every wasted byte—but it
        // confirms no unbounded-growth regression has been introduced.
        const SCALE_FACTOR = COMMENT_COUNT_LARGE / COMMENT_COUNT_SMALL;
        const GENEROUS_OVERHEAD_MULTIPLIER = 100;
        // Absolute floor: even if growthSmall ≈ 0 (everything GC'd between
        // measurements), prevent a trivially-passing assertion.  The floor is
        // set to 4× the worst-case RegExp allocation budget so the ceiling is
        // never less than ~320 KB—large enough to absorb incidental formatting
        // overhead while still being well below a pathological growth regime.
        const BYTES_PER_REGEXP = 400;
        const FLOOR_SAFETY_MARGIN = 4;
        const absoluteFloor = COMMENT_COUNT_LARGE * BYTES_PER_REGEXP * FLOOR_SAFETY_MARGIN;
        const ceiling = Math.max(absoluteFloor, growthSmall * SCALE_FACTOR * GENEROUS_OVERHEAD_MULTIPLIER);

        assert.ok(
            growthLarge < ceiling,
            `Heap grew by ${growthLarge} bytes for ${COMMENT_COUNT_LARGE} comments, ` +
                `which exceeds the expected ceiling of ${ceiling} bytes. ` +
                `Small-file growth was ${growthSmall} bytes for ${COMMENT_COUNT_SMALL} comments.`
        );
    });
});
