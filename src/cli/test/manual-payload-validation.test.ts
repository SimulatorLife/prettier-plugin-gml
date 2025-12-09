import assert from "node:assert/strict";
import test from "node:test";

import {
    decodeManualKeywordsPayload,
    decodeManualTagsPayload
} from "../src/modules/manual/payload-validation.js";
import { Core } from "@gml-modules/core";

const { getErrorMessageOrFallback, isJsonParseError } = Core;

void test("decodeManualKeywordsPayload validates keyword mappings", () => {
    const payload = decodeManualKeywordsPayload('{"foo": "bar"}');
    assert.deepEqual(payload, { foo: "bar" });
});

void test("decodeManualKeywordsPayload wraps JSON syntax errors", () => {
    assert.throws(
        () => decodeManualKeywordsPayload("not json"),
        (error) => {
            if (!isJsonParseError(error)) {
                return false;
            }
            const message = getErrorMessageOrFallback(error);
            assert.match(message, /Failed to parse manual keywords payload/i);
            return true;
        }
    );
});

void test("decodeManualKeywordsPayload rejects non-string entries", () => {
    assert.throws(
        () => decodeManualKeywordsPayload('{"foo": 42}'),
        /Manual keywords entry 'foo' must map to a string value\./
    );
});

void test("decodeManualTagsPayload validates tag mappings", () => {
    const payload = decodeManualTagsPayload('{"foo.html": "tag"}');
    assert.deepEqual(payload, { "foo.html": "tag" });
});

void test("decodeManualTagsPayload enforces object shape", () => {
    assert.throws(
        () => decodeManualTagsPayload("[]"),
        /Manual tags payload must be a JSON object\./
    );
});

void test("decodeManualTagsPayload rejects non-string entries", () => {
    assert.throws(
        () => decodeManualTagsPayload('{"foo": null}'),
        /Manual tags entry 'foo' must map to a string value\./
    );
});
