import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import {
    DEFAULT_FIXTURE_DIRECTORIES,
    normalizeFixtureRoots
} from "../src/workflow/fixture-roots.js";

void describe("normalizeFixtureRoots", () => {
    void it("includes default fixture directories by default", () => {
        const roots = normalizeFixtureRoots();

        assert.deepEqual(roots, DEFAULT_FIXTURE_DIRECTORIES);
    });

    void it("deduplicates and resolves additional fixture roots", () => {
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

    void it("filters fixture roots using workflow allow paths", () => {
        const allowedRelative = path.relative(
            process.cwd(),
            DEFAULT_FIXTURE_DIRECTORIES[1]
        );

        const roots = normalizeFixtureRoots([], {
            allowPaths: [allowedRelative]
        });

        assert.deepEqual(roots, [DEFAULT_FIXTURE_DIRECTORIES[1]]);
    });

    void it("omits denied fixture roots from workflow filters", () => {
        const roots = normalizeFixtureRoots([], {
            denyPaths: [DEFAULT_FIXTURE_DIRECTORIES[0]]
        });

        assert.deepEqual(roots, [DEFAULT_FIXTURE_DIRECTORIES[1]]);
    });
});
