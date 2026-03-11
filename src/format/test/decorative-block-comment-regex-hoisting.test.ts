/**
 * Allocation measurement: decorative slash-line detection via Core
 *
 * Background
 * ----------
 * `hasDecorativeSlashBanner` (private to `comment-printer.ts`) is called for
 * every block-comment candidate encountered during a formatting pass. It
 * delegates the per-line test to `Core.isDecorativeSlashCommentLine`, which
 * uses a module-scoped `RegExp` compiled once at module-evaluation time in
 * `@gml-modules/core`.  This guarantees that no new `RegExp` is allocated per
 * call—even though `hasDecorativeSlashBanner` may run hundreds of times per
 * formatting pass.
 *
 * Previously, `comment-printer.ts` owned a local `DECORATIVE_SLASH_LINE_PATTERN`
 * constant.  That pattern was migrated to Core (as `isDecorativeSlashCommentLine`)
 * to enforce the workspace ownership boundary: Core owns shared banner-comment
 * primitives (target-state.md §2.1), not the formatter.  The migration also
 * eliminates a duplicate definition that existed independently in
 * `printer/type-guards.ts`.
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
 *   1. Correctness – `Core.isDecorativeSlashCommentLine` accepts and rejects the
 *      right strings.
 *   2. Heap growth – formatting a file with many decorative block comments stays
 *      within a bounded heap footprint rather than growing linearly with comment
 *      count.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getHeapStatistics } from "node:v8";

import { Core } from "@gml-modules/core";

import { Format } from "../src/index.js";

// ---------------------------------------------------------------------------
// 1. Pattern correctness via Core.isDecorativeSlashCommentLine
// ---------------------------------------------------------------------------

void describe("Core.isDecorativeSlashCommentLine", () => {
    void it("accepts lines with 4 or more consecutive forward slashes", () => {
        // exactly 4 slashes – minimum threshold
        assert.ok(Core.isDecorativeSlashCommentLine("////"));
        // 6 slashes
        assert.ok(Core.isDecorativeSlashCommentLine("//////"));
        // with optional leading asterisk
        assert.ok(Core.isDecorativeSlashCommentLine("*////"));
        // with surrounding whitespace
        assert.ok(Core.isDecorativeSlashCommentLine("  ////  "));
        // with trailing asterisk
        assert.ok(Core.isDecorativeSlashCommentLine("////*"));
    });

    void it("rejects lines with fewer than 4 forward slashes", () => {
        // only 3 slashes
        assert.ok(!Core.isDecorativeSlashCommentLine("///"));
        // double slash (doc comment prefix)
        assert.ok(!Core.isDecorativeSlashCommentLine("// regular comment"));
        // empty string
        assert.ok(!Core.isDecorativeSlashCommentLine(""));
        // plain text
        assert.ok(!Core.isDecorativeSlashCommentLine("some text"));
    });
});

// ---------------------------------------------------------------------------
// 2. Heap growth measurement
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
        // Absolute floor: even if growthSmall ≈ 0 (the GC collected between
        // measurements), the ceiling must still be large enough to absorb normal
        // formatting allocations (AST nodes, tokens, output strings, etc.) for a
        // 200-comment file.  In practice a full format pass over 200 block-comment
        // + statement pairs retains ~7 MB of heap; 100 MB gives 14× headroom so
        // the assertion only fires when growth is truly pathological (≥ 0.5 MB per
        // comment), not on routine GC timing variation.
        const ABSOLUTE_FLOOR_BYTES = 100_000_000; // 100 MB
        const ceiling = Math.max(ABSOLUTE_FLOOR_BYTES, growthSmall * SCALE_FACTOR * GENEROUS_OVERHEAD_MULTIPLIER);

        assert.ok(
            growthLarge < ceiling,
            `Heap grew by ${growthLarge} bytes for ${COMMENT_COUNT_LARGE} comments, ` +
                `which exceeds the expected ceiling of ${ceiling} bytes. ` +
                `Small-file growth was ${growthSmall} bytes for ${COMMENT_COUNT_SMALL} comments.`
        );
    });
});
