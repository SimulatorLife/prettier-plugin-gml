import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { StringBuilder } from "../src/emitter/string-builder.js";

void describe("StringBuilder", () => {
    void it("should build strings from appended parts", () => {
        const builder = new StringBuilder();
        builder.append("hello");
        builder.append(" ");
        builder.append("world");
        assert.strictEqual(builder.toString(), "hello world");
    });

    void it("should support custom separators", () => {
        const builder = new StringBuilder();
        builder.append("a");
        builder.append("b");
        builder.append("c");
        assert.strictEqual(builder.toString(", "), "a, b, c");
    });

    void it("should skip empty strings", () => {
        const builder = new StringBuilder();
        builder.append("hello");
        builder.append("");
        builder.append("world");
        assert.strictEqual(builder.toString(" "), "hello world");
    });

    void it("should handle appendAll for multiple strings", () => {
        const builder = new StringBuilder();
        builder.appendAll(["one", "two", "three"]);
        assert.strictEqual(builder.toString("-"), "one-two-three");
    });

    void it("should track length correctly", () => {
        const builder = new StringBuilder();
        assert.strictEqual(builder.length, 0);
        builder.append("test");
        assert.strictEqual(builder.length, 1);
        builder.append("more");
        assert.strictEqual(builder.length, 2);
    });

    void it("should support clear for reuse", () => {
        const builder = new StringBuilder();
        builder.append("first");
        builder.clear();
        builder.append("second");
        assert.strictEqual(builder.toString(), "second");
    });

    void it("should grow capacity when needed", () => {
        const builder = new StringBuilder(2);
        builder.append("a");
        builder.append("b");
        builder.append("c");
        builder.append("d");
        assert.strictEqual(builder.toString(), "abcd");
    });

    void it("should handle large inputs efficiently", () => {
        const builder = new StringBuilder(100);
        for (let i = 0; i < 100; i++) {
            builder.append(`item${i}`);
        }
        assert.strictEqual(builder.length, 100);
        const result = builder.toString(",");
        assert.ok(result.includes("item0"));
        assert.ok(result.includes("item99"));
    });

    void it("should work with zero-capacity initialization", () => {
        const builder = new StringBuilder(0);
        builder.append("test");
        assert.strictEqual(builder.toString(), "test");
    });
});
