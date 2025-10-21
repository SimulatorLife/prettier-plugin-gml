import assert from "node:assert/strict";
import test from "node:test";

import { normalizeIdentifierMetadataEntries } from "../identifier-metadata.js";

const sampleDescriptor = { type: "Function", tags: ["function"] };

test("normalizeIdentifierMetadataEntries returns normalized entries", () => {
    const metadata = {
        identifiers: {
            draw_text: sampleDescriptor,
            "": { type: "event" }
        }
    };

    const entries = normalizeIdentifierMetadataEntries(metadata);

    assert.deepEqual(entries, [
        {
            name: "draw_text",
            type: "function",
            descriptor: sampleDescriptor
        }
    ]);
});

test("normalizeIdentifierMetadataEntries tolerates invalid inputs", () => {
    assert.deepEqual(normalizeIdentifierMetadataEntries(null), []);
    assert.deepEqual(normalizeIdentifierMetadataEntries({}), []);

    const metadata = {
        identifiers: {
            valid_name: { type: "Keyword" },
            invalid_descriptor: "string",
            missing_type: {}
        }
    };

    const entries = normalizeIdentifierMetadataEntries(metadata);

    assert.deepEqual(entries, [
        {
            name: "valid_name",
            type: "keyword",
            descriptor: { type: "Keyword" }
        },
        {
            name: "missing_type",
            type: "",
            descriptor: {}
        }
    ]);
});
