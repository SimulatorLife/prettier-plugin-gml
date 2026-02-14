import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    __normalizeFeatherMetadataForTests as normalizeFeatherMetadata,
    clearFeatherMetadataCache,
    getFeatherMetadata
} from "../src/resources/index.js";

void describe("Feather metadata cache clearing", () => {
    void it("should clear feather metadata cache and allow reload", () => {
        // Load metadata to populate cache
        const metadata1 = getFeatherMetadata();
        assert.ok(metadata1, "Should load feather metadata");
        assert.ok(Array.isArray(metadata1.diagnostics), "Should have diagnostics array");

        // Clear cache
        clearFeatherMetadataCache();

        // Reload metadata - should work even after clearing
        const metadata2 = getFeatherMetadata();
        assert.ok(metadata2, "Should reload feather metadata after clearing");
        assert.deepStrictEqual(metadata1.diagnostics, metadata2.diagnostics, "Reloaded metadata should match original");
    });
});

void describe("normalizeFeatherMetadata", () => {
    void it("trims diagnostic identifiers while preserving other fields", () => {
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

    void it("throws when the metadata payload is not a plain object", () => {
        assert.throws(() => normalizeFeatherMetadata(null), /Feather metadata must be a plain object/);
    });

    void it("throws when diagnostics are not provided as an array", () => {
        assert.throws(
            () =>
                normalizeFeatherMetadata({
                    diagnostics: "not-an-array"
                }),
            /Feather metadata diagnostics must be provided as an array/
        );
    });

    void it("throws when a diagnostic entry lacks an identifier", () => {
        assert.throws(
            () =>
                normalizeFeatherMetadata({
                    diagnostics: [{}]
                }),
            /must declare a non-empty id/
        );
    });
});
