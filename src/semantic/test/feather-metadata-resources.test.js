import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { __normalizeFeatherMetadataForTests as normalizeFeatherMetadata } from "../src/resources/feather-metadata.js";

describe("normalizeFeatherMetadata", () => {
    it("trims diagnostic identifiers while preserving other fields", () => {
        const meta = { source: "manual" };
        const metadata = {
            meta,
            diagnostics: [
                {
                    id: "  GM1234  ",
                    description: "Example diagnostic"
                }
            ]
        };

        const normalized = normalizeFeatherMetadata(metadata);

        assert.deepEqual(normalized, {
            meta,
            diagnostics: [
                {
                    id: "GM1234",
                    description: "Example diagnostic"
                }
            ]
        });
    });

    it("throws when the metadata payload is not a plain object", () => {
        assert.throws(
            () => normalizeFeatherMetadata(null),
            /Feather metadata must be a plain object/
        );
    });

    it("throws when diagnostics are not provided as an array", () => {
        assert.throws(
            () =>
                normalizeFeatherMetadata({
                    diagnostics: "not-an-array"
                }),
            /Feather metadata diagnostics must be provided as an array/
        );
    });

    it("throws when a diagnostic entry lacks an identifier", () => {
        assert.throws(
            () =>
                normalizeFeatherMetadata({
                    diagnostics: [{}]
                }),
            /must declare a non-empty id/
        );
    });
});
