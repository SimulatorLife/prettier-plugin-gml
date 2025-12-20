import assert from "node:assert/strict";
import test from "node:test";

import {
    getCanonicalParamNameFromText,
    normalizeDocMetadataName
} from "../src/comments/doc-comment/service/params.js";

void test("normalizeDocMetadataName preserves valid optional tokens", () => {
    assert.equal(normalizeDocMetadataName("[value]"), "[value]");
});

void test("normalizeDocMetadataName strips synthetic sentinels", () => {
    assert.equal(normalizeDocMetadataName("__value__"), "value");
    assert.equal(normalizeDocMetadataName("$$value$$"), "value");
});

void test("getCanonicalParamNameFromText unwraps optional tokens and defaults", () => {
    assert.equal(
        getCanonicalParamNameFromText("[value]")?.includes("["),
        false
    );
    assert.equal(getCanonicalParamNameFromText("[value=10]"), "value");
});
