import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import vm from "node:vm";

import { __test__ } from "../commands/generate-gml-identifiers.js";

const { parseArrayLiteral } = __test__;

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
});
