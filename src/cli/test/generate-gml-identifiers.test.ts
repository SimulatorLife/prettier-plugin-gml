import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import vm from "node:vm";

import { __test__ } from "../src/commands/generate-gml-identifiers.js";

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
                    return (
                        error instanceof Error &&
                        error.message ===
                            "Failed to evaluate array literal for KEYWORDS: Unknown error" &&
                        error.cause === thrown
                    );
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
                return (
                    error instanceof TypeError &&
                    /Manual identifier array 'manual:gml\.js:KEYWORDS' must evaluate to an array of strings\./.test(
                        error.message
                    ) &&
                    /Received null/.test(error.message)
                );
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
                return (
                    error instanceof TypeError &&
                    /Manual identifier array 'manual:gml\.js:KEYWORDS' must contain only strings\./.test(
                        error.message
                    ) &&
                    /Entry at index 1 was a number/.test(error.message)
                );
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
