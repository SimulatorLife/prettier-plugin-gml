import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import vm from "node:vm";

import { __test__ } from "../commands/generate-gml-identifiers.js";

const {
    parseArrayLiteral,
    collectManualArrayIdentifiers,
    assertManualIdentifierArray
} = __test__;

const SAMPLE_SOURCE = `
const KEYWORDS = [
    "alpha",
    "beta"
];
`;

describe("generate-gml-identifiers", () => {
    it("normalizes VM evaluation failures", () => {
        const thrown = Object.create(null);
        const restoreVm = mock.method(vm, "runInNewContext", () => {
            throw thrown;
        });

        try {
            assert.throws(
                () => parseArrayLiteral(SAMPLE_SOURCE, "KEYWORDS"),
                (error) => {
                    assert.equal(
                        error.message,
                        "Failed to evaluate array literal for KEYWORDS: Unknown error"
                    );
                    assert.strictEqual(error.cause, thrown);
                    return true;
                }
            );
        } finally {
            restoreVm.mock.restore();
        }
    });

    it("rejects manual identifier arrays that do not evaluate to arrays", () => {
        const identifierMap = new Map();

        assert.throws(
            () =>
                collectManualArrayIdentifiers(
                    identifierMap,
                    null,
                    { type: "keyword", source: "manual:gml.js:KEYWORDS" },
                    { identifier: "KEYWORDS" }
                ),
            (error) => {
                assert.equal(error.name, "TypeError");
                assert.match(
                    error.message,
                    /Manual identifier array 'manual:gml\.js:KEYWORDS' must evaluate to an array of strings\./
                );
                assert.match(error.message, /Received null/);
                return true;
            }
        );

        assert.equal(identifierMap.size, 0);
    });

    it("rejects manual identifier arrays containing non-string entries", () => {
        const identifierMap = new Map();

        assert.throws(
            () =>
                collectManualArrayIdentifiers(
                    identifierMap,
                    ["alpha", 5],
                    { type: "keyword", source: "manual:gml.js:KEYWORDS" },
                    { identifier: "KEYWORDS" }
                ),
            (error) => {
                assert.equal(error.name, "TypeError");
                assert.match(
                    error.message,
                    /Manual identifier array 'manual:gml\.js:KEYWORDS' must contain only strings\./
                );
                assert.match(error.message, /Entry at index 1 was a number/);
                return true;
            }
        );

        assert.equal(identifierMap.size, 0);
    });

    it("exposes assertManualIdentifierArray for tests", () => {
        const values = assertManualIdentifierArray(["alpha"], {
            identifier: "KEYWORDS",
            source: "manual:gml.js:KEYWORDS"
        });

        assert.deepEqual(values, ["alpha"]);
    });
});
