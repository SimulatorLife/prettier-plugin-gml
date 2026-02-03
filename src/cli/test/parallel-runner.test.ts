/**
 * Tests for parallel runner utility.
 */

import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import { runInParallel } from "../src/cli-core/parallel-runner.js";

void describe("runInParallel", () => {
    void it("processes all items when concurrency is high", async () => {
        const items = [1, 2, 3, 4, 5];
        const results: Array<number> = [];

        await runInParallel(
            items,
            async (value) => {
                results.push(value);
            },
            { concurrency: 10 }
        );

        results.sort((a, b) => a - b);
        deepStrictEqual(results, items);
    });

    void it("processes items with concurrency limit", async () => {
        const items = Array.from({ length: 20 }, (_, i) => i);
        const results: Array<number> = [];
        let concurrent = 0;
        let maxConcurrent = 0;

        await runInParallel(
            items,
            async (value) => {
                concurrent++;
                maxConcurrent = Math.max(maxConcurrent, concurrent);

                await new Promise((resolve) => {
                    setTimeout(resolve, 10);
                });

                results.push(value);
                concurrent--;
            },
            { concurrency: 4 }
        );

        strictEqual(maxConcurrent, 4, "Should not exceed concurrency limit");
        strictEqual(results.length, items.length, "Should process all items");
    });

    void it("handles single item correctly", async () => {
        const items = [42];
        const results: Array<number> = [];

        await runInParallel(items, async (value) => {
            results.push(value);
        });

        deepStrictEqual(results, items);
    });

    void it("handles empty array", async () => {
        const items: Array<number> = [];
        const results: Array<number> = [];

        await runInParallel(items, async (value) => {
            results.push(value);
        });

        deepStrictEqual(results, []);
    });

    void it("processes items with concurrency=1 sequentially", async () => {
        const items = [1, 2, 3, 4, 5];
        const results: Array<number> = [];
        let concurrent = 0;

        await runInParallel(
            items,
            async (value) => {
                concurrent++;
                strictEqual(concurrent, 1, "Should only process one item at a time");

                await new Promise((resolve) => {
                    setTimeout(resolve, 5);
                });

                results.push(value);
                concurrent--;
            },
            { concurrency: 1 }
        );

        deepStrictEqual(results, items);
    });

    void it("propagates errors from callback", async () => {
        const items = [1, 2, 3];

        try {
            await runInParallel(
                items,
                async (value) => {
                    if (value === 2) {
                        throw new Error("Test error");
                    }
                },
                { concurrency: 2 }
            );
            throw new Error("Should have thrown");
        } catch (error) {
            strictEqual(
                error instanceof Error && error.message === "Test error",
                true,
                "Should propagate callback error"
            );
        }
    });

    void it("validates concurrency parameter", async () => {
        const items = [1, 2, 3];

        try {
            await runInParallel(items, async () => {}, { concurrency: 0 });
            throw new Error("Should have thrown");
        } catch (error) {
            strictEqual(
                error instanceof Error && error.message.includes("Concurrency must be a positive integer"),
                true,
                "Should validate concurrency"
            );
        }
    });

    void it("provides correct index to callback", async () => {
        const items = ["a", "b", "c"];
        const indices: Array<number> = [];

        await runInParallel(
            items,
            async (_value, index) => {
                indices.push(index);
            },
            { concurrency: 2 }
        );

        indices.sort((a, b) => a - b);
        deepStrictEqual(indices, [0, 1, 2]);
    });

    void it("handles async operations correctly", async () => {
        const items = [10, 20, 30];
        const results: Array<number> = [];

        await runInParallel(
            items,
            async (value) => {
                await new Promise((resolve) => {
                    setTimeout(resolve, value);
                });
                results.push(value);
            },
            { concurrency: 3 }
        );

        strictEqual(results.length, items.length);
    });
});
