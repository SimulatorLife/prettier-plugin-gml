import assert from "node:assert/strict";
import test from "node:test";

import { __lintCommandTest__ } from "../src/commands/lint.js";

const {
    aggregateLintTotals,
    collectOutOfRootFilePaths,
    formatPathSample,
    formatOutOfRootWarning,
    OUT_OF_ROOT_DISPLAY_LIMIT
} = __lintCommandTest__;

// ---------------------------------------------------------------------------
// aggregateLintTotals
// ---------------------------------------------------------------------------

void test("aggregateLintTotals returns zero totals for an empty results array", () => {
    const totals = aggregateLintTotals([]);
    assert.equal(totals.errorCount, 0);
    assert.equal(totals.warningCount, 0);
});

void test("aggregateLintTotals sums errorCount across results", () => {
    const results = [
        { errorCount: 2, fatalErrorCount: 0, warningCount: 0 },
        { errorCount: 3, fatalErrorCount: 0, warningCount: 0 }
    ];
    const totals = aggregateLintTotals(results);
    assert.equal(totals.errorCount, 5);
    assert.equal(totals.warningCount, 0);
});

void test("aggregateLintTotals folds fatalErrorCount into errorCount", () => {
    const results = [{ errorCount: 1, fatalErrorCount: 2, warningCount: 0 }];
    const totals = aggregateLintTotals(results);
    assert.equal(totals.errorCount, 3);
});

void test("aggregateLintTotals sums warningCount across results", () => {
    const results = [
        { errorCount: 0, fatalErrorCount: 0, warningCount: 4 },
        { errorCount: 0, fatalErrorCount: 0, warningCount: 6 }
    ];
    const totals = aggregateLintTotals(results);
    assert.equal(totals.errorCount, 0);
    assert.equal(totals.warningCount, 10);
});

void test("aggregateLintTotals handles mixed errors, fatal errors, and warnings", () => {
    const results = [
        { errorCount: 1, fatalErrorCount: 1, warningCount: 2 },
        { errorCount: 0, fatalErrorCount: 3, warningCount: 1 }
    ];
    const totals = aggregateLintTotals(results);
    assert.equal(totals.errorCount, 5); // 1+1 + 0+3
    assert.equal(totals.warningCount, 3); // 2 + 1
});

// ---------------------------------------------------------------------------
// collectOutOfRootFilePaths
// ---------------------------------------------------------------------------

void test("collectOutOfRootFilePaths returns empty array when no results", () => {
    const paths = collectOutOfRootFilePaths([], "/project");
    assert.deepEqual(paths, []);
});

void test("collectOutOfRootFilePaths filters to only out-of-root paths", () => {
    const results = [
        { filePath: "/project/in-root.gml" },
        { filePath: "/other/file.gml" },
        { filePath: "/project/also-in-root.gml" },
        { filePath: "/remote/file.gml" }
    ];
    const paths = collectOutOfRootFilePaths(results, "/project");
    assert.deepEqual(paths, ["/other/file.gml", "/remote/file.gml"]);
});

void test("collectOutOfRootFilePaths returns all paths when all are out-of-root", () => {
    const results = [{ filePath: "/a/b.gml" }, { filePath: "/c/d.gml" }];
    const paths = collectOutOfRootFilePaths(results, "/project");
    assert.deepEqual(paths, ["/a/b.gml", "/c/d.gml"]);
});

void test("collectOutOfRootFilePaths returns empty array when all paths are in-root", () => {
    const results = [{ filePath: "/project/a.gml" }, { filePath: "/project/b.gml" }];
    const paths = collectOutOfRootFilePaths(results, "/project");
    assert.deepEqual(paths, []);
});

// ---------------------------------------------------------------------------
// formatPathSample
// ---------------------------------------------------------------------------

void test("formatPathSample joins paths with newlines when within display limit", () => {
    const output = formatPathSample(["/a.gml", "/b.gml", "/c.gml"]);
    assert.equal(output, "/a.gml\n/b.gml\n/c.gml");
});

void test("formatPathSample appends 'and N more...' when count exceeds display limit", () => {
    const paths = Array.from({ length: OUT_OF_ROOT_DISPLAY_LIMIT + 5 }, (_, i) => `/path/${i}.gml`);
    const output = formatPathSample(paths);
    assert.ok(output.includes("and 5 more..."), `expected suffix in: ${output}`);
});

void test("formatPathSample shows exactly OUT_OF_ROOT_DISPLAY_LIMIT paths in the sample", () => {
    const paths = Array.from({ length: OUT_OF_ROOT_DISPLAY_LIMIT + 3 }, (_, i) => `/path/${i}.gml`);
    const output = formatPathSample(paths);
    const lines = output.split("\n");
    const suffixIndex = lines.findIndex((l) => l.startsWith("and "));
    assert.equal(suffixIndex, OUT_OF_ROOT_DISPLAY_LIMIT);
});

void test("formatPathSample does not append suffix when count equals display limit exactly", () => {
    const paths = Array.from({ length: OUT_OF_ROOT_DISPLAY_LIMIT }, (_, i) => `/path/${i}.gml`);
    const output = formatPathSample(paths);
    assert.ok(!output.includes("more..."), "should not append suffix when count equals limit");
});

// ---------------------------------------------------------------------------
// formatOutOfRootWarning
// ---------------------------------------------------------------------------

void test("formatOutOfRootWarning prefixes with GML_PROJECT_OUT_OF_ROOT header", () => {
    const output = formatOutOfRootWarning(["/a/b.gml"]);
    assert.ok(output.startsWith("GML_PROJECT_OUT_OF_ROOT:\n"), `unexpected prefix in: ${output}`);
});

void test("formatOutOfRootWarning includes all paths and no suffix when within display limit", () => {
    const paths = ["/a.gml", "/b.gml", "/c.gml"];
    const output = formatOutOfRootWarning(paths);
    assert.ok(output.includes("/a.gml"));
    assert.ok(output.includes("/b.gml"));
    assert.ok(output.includes("/c.gml"));
    assert.ok(!output.includes("more..."), "should not append suffix when within limit");
});

void test("formatOutOfRootWarning delegates truncation to formatPathSample", () => {
    const paths = Array.from({ length: OUT_OF_ROOT_DISPLAY_LIMIT + 7 }, (_, i) => `/path/${i}.gml`);
    const output = formatOutOfRootWarning(paths);
    assert.ok(output.startsWith("GML_PROJECT_OUT_OF_ROOT:\n"));
    assert.ok(output.includes("and 7 more..."), `expected suffix in: ${output}`);
});
