import test from "node:test";
import assert from "node:assert/strict";

import { Semantic } from "@gml-modules/semantic";

test("Semantic.loadReservedIdentifierNames returns lowercase reserved names", () => {
    const reserved = Semantic.loadReservedIdentifierNames();

    assert.equal(reserved instanceof Set, true);
    assert.equal(reserved.has("abs"), true);
    assert.equal(reserved.has("if"), false);
});

test("Semantic.loadReservedIdentifierNames respects custom disallowed types", () => {
    const reserved = Semantic.loadReservedIdentifierNames({ disallowedTypes: [] });

    assert.equal(reserved.has("if"), true);
});

test(
    "Semantic.loadReservedIdentifierNames allows overriding the metadata loader",
    { concurrency: 1 },
    () => {
        const restore = Semantic.setReservedIdentifierMetadataLoader(() => ({
            identifiers: {
                custom_keyword: { type: "keyword" },
                custom_function: { type: "function" }
            }
        }));

        try {
            const reserved = Semantic.loadReservedIdentifierNames({
                disallowedTypes: ["keyword"]
            });

            assert.equal(reserved.has("custom_keyword"), false);
            assert.equal(reserved.has("custom_function"), true);
            assert.equal(reserved.has("abs"), false);
        } finally {
            restore();
            Semantic.resetReservedIdentifierMetadataLoader();
        }

        const reserved = Semantic.loadReservedIdentifierNames();

        assert.equal(reserved.has("abs"), true);
    }
);
