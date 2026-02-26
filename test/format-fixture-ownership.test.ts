// TODO: Once lint-formatter integration is complete, expand these tests to cover formatting fixtures more comprehensively and verify that lint does not depend on removed formatter option shapes.

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const formatTestRoot = path.resolve(process.cwd(), "src", "format", "test");
const formatFormattingFixtureRoot = path.resolve(formatTestRoot, "fixtures", "formatting");
const formatIntegrationFixtureRoot = path.resolve(process.cwd(), "test", "fixtures", "integration");
const REMOVED_FORMATTER_OPTION_KEYS = new Set([
    "applyFeatherFixes",
    "preserveGlobalVarStatements",
    "optimizeLoopLengthHoisting",
    "loopLengthHoistFunctionSuffixes",
    "condenseStructAssignments",
    "useStringInterpolation",
    "optimizeLogicalExpressions",
    "optimizeMathExpressions",
    "sanitizeMissingArgumentSeparators",
    "normalizeDocComments"
]);

function isFixtureFile(fileName: string): boolean {
    return fileName.endsWith(".gml") || fileName.endsWith(".options.json");
}

void test("format fixture files are not stored directly under src/format/test", async () => {
    const entries = await fs.readdir(formatTestRoot, { withFileTypes: true });
    const misplacedFixtures = entries
        .filter((entry) => entry.isFile() && isFixtureFile(entry.name))
        .map((entry) => entry.name);
    assert.deepEqual(misplacedFixtures, []);
});

void test("formatting fixture directory contains only valid fixture shapes", async () => {
    const entries = await fs.readdir(formatFormattingFixtureRoot);
    const fixtureEntries = entries.filter((entry) => entry.endsWith(".gml"));
    const shapes = new Map<string, { single: boolean; input: boolean; output: boolean }>();

    for (const entry of fixtureEntries) {
        const baseName = entry.endsWith(".input.gml")
            ? entry.slice(0, -".input.gml".length)
            : entry.endsWith(".output.gml")
              ? entry.slice(0, -".output.gml".length)
              : entry.slice(0, -".gml".length);

        const shape = shapes.get(baseName) ?? { single: false, input: false, output: false };
        if (entry.endsWith(".input.gml")) {
            shape.input = true;
        } else if (entry.endsWith(".output.gml")) {
            shape.output = true;
        } else {
            shape.single = true;
        }

        shapes.set(baseName, shape);
    }

    for (const [baseName, shape] of shapes) {
        assert.equal(
            shape.single && (shape.input || shape.output),
            false,
            `Fixture '${baseName}' mixes standalone and paired fixture files.`
        );
        assert.equal(
            !shape.single && (!shape.input || !shape.output),
            false,
            `Fixture '${baseName}' must include both input and output files when using paired fixtures.`
        );
    }
});

void test("integration fixture directory contains the required cross-workspace fixtures", async () => {
    const expectedFiles = [
        "test-int-comments-ops.input.gml",
        "test-int-comments-ops.output.gml",
        "test-int-comments-ops.options.json",
        "test-int-doc-tags.input.gml",
        "test-int-doc-tags.output.gml",
        "test-int-doc-tags.options.json",
        "test-int-format-strings.input.gml",
        "test-int-format-strings.output.gml",
        "test-int-format-strings.options.json",
        "test-int-func-rules.input.gml",
        "test-int-func-rules.output.gml",
        "test-int-func-rules.options.json",
        "test-int-gm1012-error.input.gml",
        "test-int-gm1012-error.output.gml",
        "test-int-gm1012-error.options.json",
        "test-int-gm1100-error.input.gml",
        "test-int-gm1100-error.output.gml",
        "test-int-gm1100-error.options.json",
        "test-int-no-globalvar.input.gml",
        "test-int-no-globalvar.output.gml",
        "test-int-no-globalvar.options.json",
        "test-int-newlines.gml",
        "test-int-newlines.options.json"
    ];

    const existing = new Set(await fs.readdir(formatIntegrationFixtureRoot));
    for (const fileName of expectedFiles) {
        assert.equal(existing.has(fileName), true, `Missing integration fixture '${fileName}'.`);
    }
});

void test("integration fixture options do not include removed formatter migration keys", async () => {
    const entries = await fs.readdir(formatIntegrationFixtureRoot);
    const optionFiles = entries.filter((entry) => entry.endsWith(".options.json"));

    for (const optionFile of optionFiles) {
        const optionPath = path.join(formatIntegrationFixtureRoot, optionFile);
        const raw = await fs.readFile(optionPath, "utf8");
        const parsed = JSON.parse(raw) as unknown;

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            continue;
        }

        const keys = Object.keys(parsed as Record<string, unknown>);
        const removedKeys = keys.filter((key) => REMOVED_FORMATTER_OPTION_KEYS.has(key));
        assert.deepEqual(
            removedKeys,
            [],
            `${optionFile} contains removed formatter option(s): ${removedKeys.join(", ")}`
        );
    }
});
