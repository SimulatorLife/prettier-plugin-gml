import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { runSequentially } from "../src/utils/async.js";

void describe("runSequentially", () => {
    void test("executes callbacks in order for all values", async () => {
        const order: number[] = [];
        const values = [1, 2, 3, 4, 5];

        await runSequentially(values, async (value, index) => {
            order.push(value);
            assert.strictEqual(values[index], value, `Index ${index} should match value ${value}`);
        });

        assert.deepStrictEqual(order, values, "Values should be processed in order");
    });

    void test("waits for async callbacks to complete before proceeding", async () => {
        const order: string[] = [];
        const values = ["first", "second", "third"];

        await runSequentially(values, async (value) => {
            // Simulate async work with varying delays
            const delay = value === "second" ? 50 : 10;
            await new Promise((resolve) => setTimeout(resolve, delay));
            order.push(value);
        });

        assert.deepStrictEqual(order, values, "Should maintain order despite varying async delays");
    });

    void test("handles synchronous callbacks", async () => {
        const results: number[] = [];

        await runSequentially([1, 2, 3], (value) => {
            results.push(value * 2);
        });

        assert.deepStrictEqual(results, [2, 4, 6]);
    });

    void test("works with empty iterables", async () => {
        let callCount = 0;

        await runSequentially([], () => {
            callCount++;
        });

        assert.strictEqual(callCount, 0, "Should not call callback for empty iterable");
    });

    void test("works with Set iterables", async () => {
        const results: string[] = [];
        const values = new Set(["a", "b", "c"]);

        await runSequentially(values, async (value) => {
            results.push(value);
        });

        assert.deepStrictEqual(results, ["a", "b", "c"]);
    });

    void test("works with Map.entries() iterables", async () => {
        const results: Array<[string, number]> = [];
        const map = new Map([
            ["one", 1],
            ["two", 2],
            ["three", 3]
        ]);

        await runSequentially(map.entries(), async ([key, value]) => {
            results.push([key, value]);
        });

        assert.deepStrictEqual(results, [
            ["one", 1],
            ["two", 2],
            ["three", 3]
        ]);
    });

    void test("provides correct index to callback", async () => {
        const indices: number[] = [];

        await runSequentially(["a", "b", "c"], async (_value, index) => {
            indices.push(index);
        });

        assert.deepStrictEqual(indices, [0, 1, 2]);
    });

    void test("propagates errors from callbacks", async () => {
        const error = new Error("Test error");

        await assert.rejects(
            async () => {
                await runSequentially([1, 2, 3], async (value) => {
                    if (value === 2) {
                        throw error;
                    }
                });
            },
            (err) => err === error,
            "Should propagate callback errors"
        );
    });

    void test("stops execution on first error", async () => {
        const processed: number[] = [];

        await assert.rejects(async () => {
            await runSequentially([1, 2, 3, 4], async (value) => {
                processed.push(value);
                if (value === 2) {
                    throw new Error("Stop here");
                }
            });
        });

        assert.deepStrictEqual(processed, [1, 2], "Should stop after error at index 1");
    });

    void test("handles single-element iterables", async () => {
        const results: number[] = [];

        await runSequentially([42], async (value, index) => {
            results.push(value);
            assert.strictEqual(index, 0);
        });

        assert.deepStrictEqual(results, [42]);
    });
});
