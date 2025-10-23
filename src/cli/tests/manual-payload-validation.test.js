import assert from "node:assert/strict";
import test from "node:test";

import {
    decodeManualKeywordsPayload,
    decodeManualTagsPayload
} from "../lib/manual-payload-validation.js";
import { isJsonParseError } from "../lib/shared-deps.js";

test("decodeManualKeywordsPayload validates keyword mappings", () => {
    const payload = decodeManualKeywordsPayload('{"foo": "bar"}');
    assert.deepEqual(payload, { foo: "bar" });
});

test("decodeManualKeywordsPayload wraps JSON syntax errors", () => {
    assert.throws(
        () => decodeManualKeywordsPayload("not json"),
        (error) => {
            assert.ok(isJsonParseError(error));
            assert.match(
                error.message,
                /Failed to parse manual keywords payload/i
            );
            return true;
        }
    );
});

test("decodeManualKeywordsPayload rejects non-string entries", () => {
    assert.throws(
        () => decodeManualKeywordsPayload('{"foo": 42}'),
        /Manual keywords entry 'foo' must map to a string value\./
    );
});

test("decodeManualTagsPayload validates tag mappings", () => {
    const payload = decodeManualTagsPayload('{"foo.html": "tag"}');
    assert.deepEqual(payload, { "foo.html": "tag" });
});

test("decodeManualTagsPayload enforces object shape", () => {
    assert.throws(
        () => decodeManualTagsPayload("[]"),
        /Manual tags payload must be a JSON object\./
    );
});

test("decodeManualTagsPayload rejects non-string entries", () => {
    assert.throws(
        () => decodeManualTagsPayload('{"foo": null}'),
        /Manual tags entry 'foo' must map to a string value\./
    );
});
