import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    tryAddSample,
    hasSample
} from "../src/cli-core/bounded-sample-collector.js";

/**
 * Check object equality by comparing id property.
 */
function areObjectsEqualById(a, b) {
    return a.id === b.id;
}

void describe("bounded-sample-collector", () => {
    void describe("tryAddSample", () => {
        void it("adds a sample when limit is not reached", () => {
            const samples = [];
            const result = tryAddSample(samples, "test", 5);

            assert.strictEqual(result, true);
            assert.deepStrictEqual(samples, ["test"]);
        });

        void it("does not add a sample when limit is 0", () => {
            const samples = [];
            const result = tryAddSample(samples, "test", 0);

            assert.strictEqual(result, false);
            assert.deepStrictEqual(samples, []);
        });

        void it("does not add a sample when limit is negative", () => {
            const samples = [];
            const result = tryAddSample(samples, "test", -1);

            assert.strictEqual(result, false);
            assert.deepStrictEqual(samples, []);
        });

        void it("does not add a sample when limit is already reached", () => {
            const samples = ["a", "b", "c"];
            const result = tryAddSample(samples, "d", 3);

            assert.strictEqual(result, false);
            assert.deepStrictEqual(samples, ["a", "b", "c"]);
        });

        void it("does not add a duplicate sample (primitive values)", () => {
            const samples = ["a", "b"];
            const result = tryAddSample(samples, "a", 5);

            assert.strictEqual(result, false);
            assert.deepStrictEqual(samples, ["a", "b"]);
        });

        void it("does not add a duplicate sample with custom equality check", () => {
            const samples = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" }
            ];
            const result = tryAddSample(
                samples,
                { id: 1, name: "Alice Updated" },
                5,
                areObjectsEqualById
            );

            assert.strictEqual(result, false);
            assert.strictEqual(samples.length, 2);
            assert.strictEqual(samples[0].name, "Alice");
        });

        void it("adds a non-duplicate sample with custom equality check", () => {
            const samples = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" }
            ];
            const result = tryAddSample(
                samples,
                { id: 3, name: "Charlie" },
                5,
                areObjectsEqualById
            );

            assert.strictEqual(result, true);
            assert.strictEqual(samples.length, 3);
            assert.strictEqual(samples[2].name, "Charlie");
        });
    });

    void describe("hasSample", () => {
        void it("returns true when sample exists (primitive)", () => {
            const samples = ["a", "b", "c"];
            const result = hasSample(samples, "b");

            assert.strictEqual(result, true);
        });

        void it("returns false when sample does not exist (primitive)", () => {
            const samples = ["a", "b", "c"];
            const result = hasSample(samples, "d");

            assert.strictEqual(result, false);
        });

        void it("returns true when sample exists with custom equality", () => {
            const samples = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" }
            ];
            const result = hasSample(
                samples,
                { id: 2, name: "Different" },
                areObjectsEqualById
            );

            assert.strictEqual(result, true);
        });

        void it("returns false when sample does not exist with custom equality", () => {
            const samples = [
                { id: 1, name: "Alice" },
                { id: 2, name: "Bob" }
            ];
            const result = hasSample(
                samples,
                { id: 3, name: "Charlie" },
                areObjectsEqualById
            );

            assert.strictEqual(result, false);
        });

        void it("returns false for empty array", () => {
            const samples = [];
            const result = hasSample(samples, "test");

            assert.strictEqual(result, false);
        });
    });
});
