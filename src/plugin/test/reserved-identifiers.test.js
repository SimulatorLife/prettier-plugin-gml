import test from "node:test";
import assert from "node:assert/strict";

import {
    loadReservedIdentifierNames,
    resetReservedIdentifierMetadataLoader,
    setReservedIdentifierMetadataLoader
} from "gamemaker-language-semantic/resources/reserved-identifiers.js";

test("loadReservedIdentifierNames returns lowercase reserved names", () => {
    const reserved = loadReservedIdentifierNames();

    assert.equal(reserved instanceof Set, true);
    assert.equal(reserved.has("abs"), true);
    assert.equal(reserved.has("if"), false);
});

test("loadReservedIdentifierNames respects custom disallowed types", () => {
    const reserved = loadReservedIdentifierNames({ disallowedTypes: [] });

    assert.equal(reserved.has("if"), true);
});

test(
    "loadReservedIdentifierNames allows overriding the metadata loader",
    { concurrency: 1 },
    () => {
        const restore = setReservedIdentifierMetadataLoader(() => ({
            identifiers: {
                custom_keyword: { type: "keyword" },
                custom_function: { type: "function" }
            }
        }));

        try {
            const reserved = loadReservedIdentifierNames({
                disallowedTypes: ["keyword"]
            });

            assert.equal(reserved.has("custom_keyword"), false);
            assert.equal(reserved.has("custom_function"), true);
            assert.equal(reserved.has("abs"), false);
        } finally {
            restore();
            resetReservedIdentifierMetadataLoader();
        }

        const reserved = loadReservedIdentifierNames();

        assert.equal(reserved.has("abs"), true);
    }
);
