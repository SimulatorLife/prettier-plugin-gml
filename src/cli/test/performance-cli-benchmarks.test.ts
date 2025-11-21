import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    runFormatterBenchmark,
    runParserBenchmark
} from "../src/modules/performance/index.js";

function isCompletedBenchmarkResult(value: unknown): value is {
    iterations: number;
    durations: Array<number>;
    totalDurationMs: number;
    averageDurationMs: number;
    dataset: { files: number; totalBytes: number };
    throughput: { filesPerMs: number; bytesPerMs: number };
} {
    return Boolean(
        value &&
            typeof value === "object" &&
            "iterations" in value &&
            "dataset" in value &&
            "durations" in value &&
            "totalDurationMs" in value &&
            "averageDurationMs" in value &&
            "throughput" in value
    );
}

function isSkippedBenchmarkResult(
    value: unknown
): value is { skipped: boolean; reason?: unknown } {
    return Boolean(value && typeof value === "object" && "skipped" in value);
}

function createNowStub(step) {
    let current = 0;
    return () => {
        current += step;
        return current;
    };
}

describe("performance CLI benchmarks", () => {
    it("runs the parser benchmark with injected dataset and parser", async () => {
        const dataset = [
            { path: "/tmp/a.gml", source: "var a = 1;\n" },
            { path: "/tmp/b.gml", source: "var b = 2;\n" }
        ];

        const visited = [];
        const now = createNowStub(5);

        const result = await runParserBenchmark({
            dataset,
            iterations: 2,
            parser: async (file) => {
                visited.push(file.path);
            },
            now
        });

        if (!isCompletedBenchmarkResult(result)) {
            assert.fail("Benchmark result unexpectedly skipped");
        }

        assert.deepEqual(visited, [
            "/tmp/a.gml",
            "/tmp/b.gml",
            "/tmp/a.gml",
            "/tmp/b.gml"
        ]);
        assert.equal(result.iterations, 2);
        assert.equal(result.dataset.files, 2);
        assert.equal(result.durations.length, 2);
        assert.equal(result.totalDurationMs, 10);
        assert.equal(result.averageDurationMs, 5);
        assert.equal(result.dataset.totalBytes, 22);
        assert.equal(result.throughput.filesPerMs, 0.4);
    });

    it("runs the formatter benchmark with a custom formatter", async () => {
        const dataset = [
            {
                path: "/tmp/sample.gml",
                source: "function demo() {\n    return 1;\n}\n"
            }
        ];

        const formatted = [];
        const now = createNowStub(3);

        const result = await runFormatterBenchmark({
            dataset,
            iterations: 3,
            formatter: async (file) => {
                formatted.push(file.path);
            },
            now
        });

        if (!isCompletedBenchmarkResult(result)) {
            assert.fail("Benchmark result unexpectedly skipped");
        }

        assert.deepEqual(formatted, [
            "/tmp/sample.gml",
            "/tmp/sample.gml",
            "/tmp/sample.gml"
        ]);
        assert.equal(result.iterations, 3);
        assert.equal(result.dataset.files, 1);
        assert.equal(result.durations.length, 3);
        assert.equal(result.totalDurationMs, 9);
        assert.equal(result.averageDurationMs, 3);
    });

    it("skips benchmarks when the dataset is empty", async () => {
        const parseResult = await runParserBenchmark({ dataset: [] });
        assert.ok(isSkippedBenchmarkResult(parseResult));
        assert.equal(parseResult.skipped, true);

        const formatResult = await runFormatterBenchmark({ dataset: [] });
        assert.ok(isSkippedBenchmarkResult(formatResult));
        assert.equal(formatResult.skipped, true);
    });
});
