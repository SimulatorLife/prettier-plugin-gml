import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { describe, it } from "node:test";

import { Parser } from "@gml-modules/parser";

import { emitJavaScript } from "../src/emitter/emitter-entrypoints.js";

/**
 * Micro-benchmarks for StringBuilder performance improvements.
 *
 * These benchmarks measure compile speed improvements from using pre-allocated
 * buffers instead of repeated string concatenation in hot paths.
 */

const ITERATIONS = 100;

function measureEmit(code: string, _label: string): number {
    const parser = new Parser.GMLParser(code);
    const ast = parser.parse();

    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        emitJavaScript(ast);
        const end = performance.now();
        times.push(end - start);
    }

    // Remove outliers (first 10 warm-up runs and top/bottom 10%)
    times.sort((a, b) => a - b);
    const trimmed = times.slice(10, Math.floor(times.length * 0.9));
    return trimmed.reduce((sum, t) => sum + t, 0) / trimmed.length;
}

void describe("StringBuilder Performance", () => {
    void it("should handle multi-statement programs efficiently", () => {
        const code = Array.from({ length: 50 }, (_, i) => `var x${i} = ${i};`).join("\n");
        const avgTime = measureEmit(code, "multi-statement");

        // Baseline: should complete in reasonable time (< 1ms per iteration on average)
        assert.ok(avgTime < 1, `Average time ${avgTime.toFixed(3)}ms exceeded 1ms threshold`);
    });

    void it("should handle large blocks efficiently", () => {
        const statements = Array.from({ length: 30 }, (_, i) => `    x += ${i};`).join("\n");
        const code = `function test() {\n${statements}\n}`;
        const avgTime = measureEmit(code, "large-block");

        assert.ok(avgTime < 1, `Average time ${avgTime.toFixed(3)}ms exceeded 1ms threshold`);
    });

    void it("should handle multi-dimensional array access efficiently", () => {
        const code = "var val = arr[0][1][2][3][4];";
        const avgTime = measureEmit(code, "multi-dim-array");

        assert.ok(avgTime < 0.5, `Average time ${avgTime.toFixed(3)}ms exceeded 0.5ms threshold`);
    });

    void it("should handle switch statements with many cases efficiently", () => {
        const cases = Array.from({ length: 20 }, (_, i) => `case ${i}:\n    result = ${i};\n    break;`).join("\n");
        const code = `switch (value) {\n${cases}\n}`;
        const avgTime = measureEmit(code, "large-switch");

        assert.ok(avgTime < 1, `Average time ${avgTime.toFixed(3)}ms exceeded 1ms threshold`);
    });

    void it("should handle multiple variable declarations efficiently", () => {
        const vars = Array.from({ length: 20 }, (_, i) => `v${i}`).join(", ");
        const code = `var ${vars};`;
        const avgTime = measureEmit(code, "multi-var-decl");

        assert.ok(avgTime < 0.5, `Average time ${avgTime.toFixed(3)}ms exceeded 0.5ms threshold`);
    });

    void it("should handle template strings with many interpolations efficiently", () => {
        const parts = Array.from({ length: 20 }, (_, i) => `part${i}: {x${i}}`).join(" ");
        const code = `var msg = $"${parts}";`;
        const avgTime = measureEmit(code, "template-string");

        assert.ok(avgTime < 1, `Average time ${avgTime.toFixed(3)}ms exceeded 1ms threshold`);
    });

    void it("should handle struct expressions with many properties efficiently", () => {
        const props = Array.from({ length: 30 }, (_, i) => `prop${i}: ${i}`).join(", ");
        const code = `var obj = {${props}};`;
        const avgTime = measureEmit(code, "struct-expr");

        assert.ok(avgTime < 1, `Average time ${avgTime.toFixed(3)}ms exceeded 1ms threshold`);
    });

    void it("should handle functions with many parameters efficiently", () => {
        const params = Array.from({ length: 20 }, (_, i) => `p${i}`).join(", ");
        const code = `function test(${params}) { return p0; }`;
        const avgTime = measureEmit(code, "many-params");

        assert.ok(avgTime < 1, `Average time ${avgTime.toFixed(3)}ms exceeded 1ms threshold`);
    });
});
