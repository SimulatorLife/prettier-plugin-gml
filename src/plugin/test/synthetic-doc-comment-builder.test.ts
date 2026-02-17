import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getSyntheticDocCommentForFunctionAssignment,
    getSyntheticDocCommentForStaticVariable
} from "../src/printer/doc-comment/index.js";

void describe("synthetic doc comment payload resolution", () => {
    void it("returns cached payloads for static variables", () => {
        const node = {
            _gmlSyntheticDocComment: {
                docLines: ["/// @description cached static", 3],
                hasExistingDocLines: true,
                plainLeadingLines: ["", "// leading"]
            }
        };

        const result = getSyntheticDocCommentForStaticVariable(node, {}, {}, null);

        assert.deepEqual(result?.docLines, ["/// @description cached static"]);
        assert.equal(result?.hasExistingDocLines, true);
        assert.deepEqual(result?.plainLeadingLines, ["", "// leading"]);
        assert.notEqual(result?.doc, null);
    });

    void it("returns cached payloads for function assignments", () => {
        const node = {
            _gmlSyntheticDocComment: {
                docLines: ["/// @description cached function"],
                hasExistingDocLines: false,
                plainLeadingLines: ["// comment"]
            }
        };

        const result = getSyntheticDocCommentForFunctionAssignment(node, {}, {}, null);

        assert.deepEqual(result?.docLines, ["/// @description cached function"]);
        assert.equal(result?.hasExistingDocLines, false);
        assert.deepEqual(result?.plainLeadingLines, ["// comment"]);
        assert.notEqual(result?.doc, null);
    });

    void it("ignores invalid caches consistently", () => {
        const node = {
            _gmlSyntheticDocComment: {
                docLines: [1, 2],
                hasExistingDocLines: true,
                plainLeadingLines: []
            }
        };

        assert.equal(getSyntheticDocCommentForStaticVariable(node, {}, {}, null), null);
        assert.equal(getSyntheticDocCommentForFunctionAssignment(node, {}, {}, null), null);
    });
});
