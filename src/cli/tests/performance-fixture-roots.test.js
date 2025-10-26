import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { normalizeFixtureRoots } from "../features/performance/index.js";

const MODULE_DIRECTORY = path.dirname(
    fileURLToPath(new URL("../features/performance/index.js", import.meta.url))
);
const CLI_DIRECTORY = path.resolve(MODULE_DIRECTORY, "..");
const REPO_ROOT = path.resolve(CLI_DIRECTORY, "..");
const DEFAULT_FIXTURE_DIRECTORIES = [
    path.resolve(REPO_ROOT, "src", "parser", "tests", "input"),
    path.resolve(REPO_ROOT, "src", "plugin", "tests")
];

describe("normalizeFixtureRoots", () => {
    it("includes default fixture directories by default", () => {
        const roots = normalizeFixtureRoots();

        assert.deepEqual(roots, DEFAULT_FIXTURE_DIRECTORIES);
    });

    it("deduplicates and resolves additional fixture roots", () => {
        const duplicateRelative = path.relative(
            process.cwd(),
            DEFAULT_FIXTURE_DIRECTORIES[0]
        );
        const customRelative = "./custom-fixtures";

        const roots = normalizeFixtureRoots([
            duplicateRelative,
            DEFAULT_FIXTURE_DIRECTORIES[0],
            customRelative,
            customRelative,
            null,
            "",
            123
        ]);

        const expected = [
            ...DEFAULT_FIXTURE_DIRECTORIES,
            path.resolve(customRelative)
        ];

        assert.deepEqual(roots, expected);
    });

    it("filters fixture roots using workflow allow paths", () => {
        const allowedRelative = path.relative(
            process.cwd(),
            DEFAULT_FIXTURE_DIRECTORIES[1]
        );

        const roots = normalizeFixtureRoots([], {
            allowPaths: [allowedRelative]
        });

        assert.deepEqual(roots, [DEFAULT_FIXTURE_DIRECTORIES[1]]);
    });

    it("omits denied fixture roots from workflow filters", () => {
        const roots = normalizeFixtureRoots([], {
            denyPaths: [DEFAULT_FIXTURE_DIRECTORIES[0]]
        });

        assert.deepEqual(roots, [DEFAULT_FIXTURE_DIRECTORIES[1]]);
    });
});
