import assert from "node:assert/strict";
import test from "node:test";

import { gmlTransformDocCommentServices } from "../../../../src/rules/gml/transforms/doc-comment-services.js";

void test("gmlTransformDocCommentServices exposes the doc-comment contract needed by transforms", () => {
    assert.equal(typeof gmlTransformDocCommentServices.collectSyntheticDocCommentLines, "function");
    assert.equal(typeof gmlTransformDocCommentServices.computeSyntheticFunctionDocLines, "function");
    assert.equal(typeof gmlTransformDocCommentServices.prepareDocCommentEnvironment, "function");
    assert.equal(typeof gmlTransformDocCommentServices.getArgumentIndexFromIdentifier, "function");
});
