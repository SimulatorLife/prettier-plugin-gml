import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { DEFAULT_FIXTURE_DIRECTORIES, normalizeFixtureRoots } from "../src/workflow/fixture-roots.js";

void describe("workflow fixture root normalization", () => {
    void it("deduplicates additional roots that overlap defaults", () => {
        const firstDefault = DEFAULT_FIXTURE_DIRECTORIES[0];
        const normalized = normalizeFixtureRoots([firstDefault, firstDefault]);

        assert.equal(
            normalized.filter((entry) => entry === firstDefault).length,
            1,
            "expected duplicated fixture roots to be collapsed"
        );
    });

    void it("applies allow/deny filters to normalized fixture roots", () => {
        const allowedRoot = path.resolve("/tmp", "fixture-roots", "allowed");
        const deniedRoot = path.resolve(allowedRoot, "denied");

        const normalized = normalizeFixtureRoots([allowedRoot, deniedRoot], {
            allowPaths: [allowedRoot],
            denyPaths: [deniedRoot]
        });

        assert.ok(normalized.includes(allowedRoot));
        assert.equal(normalized.includes(deniedRoot), false);
    });

    void it("accepts allow/deny aliases for fixture path filtering", () => {
        const root = path.resolve("/tmp", "fixture-roots", "aliases");
        const includedRoot = path.join(root, "included");
        const excludedRoot = path.join(includedRoot, "excluded");

        const normalized = normalizeFixtureRoots([includedRoot, excludedRoot], {
            includePaths: [includedRoot],
            excludePaths: [excludedRoot]
        });

        assert.ok(normalized.includes(includedRoot));
        assert.equal(normalized.includes(excludedRoot), false);
    });
});
