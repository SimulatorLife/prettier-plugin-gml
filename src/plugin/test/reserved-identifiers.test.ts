import test from "node:test";
import assert from "node:assert/strict";

import { Core } from "@gml-modules/core";

void test("Core.loadReservedIdentifierNames returns lowercase reserved names", () => {
    const reserved = Core.loadReservedIdentifierNames();

    assert.equal(reserved instanceof Set, true);
    assert.equal(reserved.has("abs"), true);
    assert.equal(reserved.has("if"), false);
});

void test("Core.loadReservedIdentifierNames respects custom disallowed types", () => {
    const reserved = Core.loadReservedIdentifierNames({
        disallowedTypes: []
    });

    assert.equal(reserved.has("if"), true);
});

void test("Core.loadReservedIdentifierNames allows overriding the metadata loader", { concurrency: 1 }, () => {
    const restore = Core.setReservedIdentifierMetadataLoader(() => ({
        identifiers: {
            custom_keyword: { type: "keyword" },
            custom_function: { type: "function" }
        }
    }));

    try {
        const reserved = Core.loadReservedIdentifierNames({
            disallowedTypes: ["keyword"]
        });

        assert.equal(reserved.has("custom_keyword"), false);
        assert.equal(reserved.has("custom_function"), true);
        assert.equal(reserved.has("abs"), false);
    } finally {
        restore();
        Core.resetReservedIdentifierMetadataLoader();
    }

    const reserved = Core.loadReservedIdentifierNames();

    assert.equal(reserved.has("abs"), true);
});
