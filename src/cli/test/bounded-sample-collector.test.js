import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    tryAddSample,
    hasSample
} from "../src/core/bounded-sample-collector.js";

describe("bounded-sample-collector", () => {
    describe("tryAddSample", () => {
        it("adds a sample when limit is not reached", () => {
            const samples = [];
            const result = tryAddSample(samples, "test", 5);

            assert.strictEqual(result, true);
            assert.deepStrictEqual(samples, ["test"]);
        });

        it("does not add a sample when limit is 0", () => {
            const samples = [];
            const result = tryAddSample(samples, "test", 0);

            assert.strictEqual(result, false);
            assert.deepStrictEqual(samples, []);
        });

        it("does not add a sample when limit is negative", () => {
            const samples = [];
            const result = tryAddSample(samples, "test", -1);

            assert.strictEqual(result, false);
            assert.deepStrictEqual(samples, []);
        });

        it("does not add a sample when limit is already reached", () => {
            const samples = ["a", "b", "c"];
            const result = tryAddSample(samples, "d", 3);

            assert.strictEqual(result, false);
            assert.deepStrictEqual(samples, ["a", "b", "c"]);
        });

        it("does not add a duplicate sample (primitive values)", () => {
            const samples = ["a", "b"];
            const result = tryAddSample(samples, "a", 5);

            assert.strictEqual(result, false);
            assert.deepStrictEqual(samples, ["a", "b"]);
        });

        it("does not add a duplicate sample with custom equality check", () => {
            const samples = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" }
            ];
            const isEqual = (a, b) => a.id === b.id;
            const result = tryAddSample(
                samples,
                { id: 1, name: "Alice Updated" },
                5,
                isEqual
            );

            assert.strictEqual(result, false);
            assert.strictEqual(samples.length, 2);
            assert.strictEqual(samples[0].name, "Alice");
        });

        it("adds a non-duplicate sample with custom equality check", () => {
            const samples = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" }
            ];
            const isEqual = (a, b) => a.id === b.id;
            const result = tryAddSample(
                samples,
                { id: 3, name: "Charlie" },
                5,
                isEqual
            );

            assert.strictEqual(result, true);
            assert.strictEqual(samples.length, 3);
            assert.strictEqual(samples[2].name, "Charlie");
        });
    });

    describe("hasSample", () => {
        it("returns true when sample exists (primitive)", () => {
            const samples = ["a", "b", "c"];
            const result = hasSample(samples, "b");

            assert.strictEqual(result, true);
        });

        it("returns false when sample does not exist (primitive)", () => {
            const samples = ["a", "b", "c"];
            const result = hasSample(samples, "d");

            assert.strictEqual(result, false);
        });

        it("returns true when sample exists with custom equality", () => {
            const samples = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" }
            ];
            const isEqual = (a, b) => a.id === b.id;
            const result = hasSample(
                samples,
                { id: 2, name: "Different" },
                isEqual
            );

            assert.strictEqual(result, true);
        });

        it("returns false when sample does not exist with custom equality", () => {
            const samples = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" }
            ];
            const isEqual = (a, b) => a.id === b.id;
            const result = hasSample(
                samples,
                { id: 3, name: "Charlie" },
                isEqual
            );

            assert.strictEqual(result, false);
        });

        it("returns false for empty array", () => {
            const samples = [];
            const result = hasSample(samples, "test");

            assert.strictEqual(result, false);
        });
    });
});
