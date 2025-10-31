import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCommandUsage } from "../src/core/command-usage.js";

test("resolveCommandUsage reads usage() when helpInformation is absent", () => {
    const command = {
        usage() {
            return "usage placeholder";
        }
    };

    assert.equal(resolveCommandUsage(command), "usage placeholder");
});

test("resolveCommandUsage falls back when no usage metadata is present", () => {
    assert.equal(
        resolveCommandUsage({}, { fallback: "manual fallback" }),
        "manual fallback"
    );

    assert.equal(
        resolveCommandUsage(null, { fallback: () => "lazy fallback" }),
        "lazy fallback"
    );
});
