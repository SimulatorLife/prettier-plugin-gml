import assert from "node:assert";
import { test } from "node:test";

import { runInParallel, runSequentially } from "../src/utils/async.js";

// === runSequentially tests ===

void test("runSequentially executes callbacks in order", async () => {
    const results: Array<number> = [];
    await runSequentially([1, 2, 3], async (num) => {
        results.push(num);
    });
    assert.deepEqual(results, [1, 2, 3]);
});

void test("runSequentially passes correct indices", async () => {
    const indices: Array<number> = [];
    await runSequentially(["a", "b", "c"], async (_, index) => {
        indices.push(index);
    });
    assert.deepEqual(indices, [0, 1, 2]);
});

void test("runSequentially handles empty array", async () => {
    let called = false;
    await runSequentially([], async () => {
        called = true;
    });
    assert.equal(called, false);
});

void test("runSequentially handles async operations", async () => {
    const results: Array<number> = [];
    await runSequentially([1, 2, 3], async (num) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(num);
    });
    assert.deepEqual(results, [1, 2, 3]);
});

void test("runSequentially propagates errors", async () => {
    await assert.rejects(
        async () => {
            await runSequentially([1, 2, 3], async (num) => {
                if (num === 2) {
                    throw new Error("Test error");
                }
            });
        },
        { message: "Test error" }
    );
});

// === runInParallel tests ===

void test("runInParallel executes callbacks in parallel", async () => {
    const startTimes: Array<number> = [];
    const results = await runInParallel([1, 2, 3], async (num) => {
        startTimes.push(Date.now());
        await new Promise((resolve) => setTimeout(resolve, 50));
        return num * 2;
    });

    // All callbacks should start at roughly the same time (within 20ms)
    const timeSpread = Math.max(...startTimes) - Math.min(...startTimes);
    assert.ok(timeSpread < 20, `Time spread too large: ${timeSpread}ms`);

    // Results should be returned in order
    assert.deepEqual(results, [2, 4, 6]);
});

void test("runInParallel passes correct indices", async () => {
    const results = await runInParallel(["a", "b", "c"], async (value, index) => {
        return `${index}:${value}`;
    });
    assert.deepEqual(results, ["0:a", "1:b", "2:c"]);
});

void test("runInParallel handles empty array", async () => {
    const results = await runInParallel([], async () => {
        return 42;
    });
    assert.deepEqual(results, []);
});

void test("runInParallel maintains result order despite different completion times", async () => {
    const results = await runInParallel([100, 50, 10], async (delay) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return delay;
    });
    // Results should maintain input order, not completion order
    assert.deepEqual(results, [100, 50, 10]);
});

void test("runInParallel propagates errors", async () => {
    await assert.rejects(
        async () => {
            await runInParallel([1, 2, 3], async (num) => {
                if (num === 2) {
                    throw new Error("Test error");
                }
                return num;
            });
        },
        { message: "Test error" }
    );
});

void test("runInParallel handles synchronous callbacks", async () => {
    const results = await runInParallel([1, 2, 3], (num) => {
        return num * 3;
    });
    assert.deepEqual(results, [3, 6, 9]);
});

void test("runInParallel works with iterables", async () => {
    const set = new Set([1, 2, 3]);
    const results = await runInParallel(set, async (num) => {
        return num + 10;
    });
    assert.deepEqual(results, [11, 12, 13]);
});

void test("runInParallel is faster than sequential for slow operations", async () => {
    const delayMs = 50;
    const count = 5;

    // Time parallel execution
    const parallelStart = Date.now();
    await runInParallel(Array.from({ length: count }).fill(delayMs), async (delay: number) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
    });
    const parallelDuration = Date.now() - parallelStart;

    // Time sequential execution
    const sequentialStart = Date.now();
    await runSequentially(Array.from({ length: count }).fill(delayMs), async (delay: number) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
    });
    const sequentialDuration = Date.now() - sequentialStart;

    // Parallel should be significantly faster (at least 2x for 5 operations)
    assert.ok(
        parallelDuration < sequentialDuration / 2,
        `Parallel (${parallelDuration}ms) should be much faster than sequential (${sequentialDuration}ms)`
    );
});
