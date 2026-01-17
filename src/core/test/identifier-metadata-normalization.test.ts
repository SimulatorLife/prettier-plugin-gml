import assert from "node:assert";
import { describe, it } from "node:test";

import { Core } from "../src/index.js";

void describe("Identifier metadata normalization", () => {
    void it("filters descriptors missing a valid type string", () => {
        const entries = Core.normalizeIdentifierMetadataEntries({
            identifiers: {
                alpha: { type: "Function" },
                beta: { type: 42 },
                gamma: {},
                delta: "not-an-object"
            }
        });

        assert.deepStrictEqual(entries, [
            {
                name: "alpha",
                type: "function",
                descriptor: { type: "Function" }
            }
        ]);
    });

    void it("ignores payloads without an identifier map", () => {
        assert.deepStrictEqual(Core.normalizeIdentifierMetadataEntries({}), []);
        assert.deepStrictEqual(Core.normalizeIdentifierMetadataEntries({ identifiers: [] }), []);
        assert.deepStrictEqual(Core.normalizeIdentifierMetadataEntries(null), []);
    });
});
