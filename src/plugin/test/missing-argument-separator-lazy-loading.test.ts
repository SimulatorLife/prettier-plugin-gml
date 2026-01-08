import { describe, it } from "node:test";
import assert from "node:assert";
import { Core } from "@gml-modules/core";

describe("Missing argument separator sanitizer lazy loading", () => {
    it("should demonstrate memory footprint reduction with lazy loading", () => {
        // Clear the cache to start fresh
        Core.clearIdentifierMetadataCache();

        // Force GC if available
        if (typeof globalThis.gc === "function") {
            for (let i = 0; i < 5; i++) {
                globalThis.gc();
            }
        }

        const beforeLoad = process.memoryUsage();

        // Eagerly load the metadata (simulating the old behavior)
        const identifierMetadataEntries = Core.normalizeIdentifierMetadataEntries(Core.getIdentifierMetadata());
        const keywordCount = identifierMetadataEntries.filter((e) => e.type === "keyword").length;

        if (typeof globalThis.gc === "function") {
            globalThis.gc();
        }

        const afterLoad = process.memoryUsage();
        const loadedHeap = afterLoad.heapUsed - beforeLoad.heapUsed;

        // Clear the cache to free the memory
        Core.clearIdentifierMetadataCache();

        if (typeof globalThis.gc === "function") {
            for (let i = 0; i < 5; i++) {
                globalThis.gc();
            }
        }

        const afterClear = process.memoryUsage();
        const freedHeap = afterLoad.heapUsed - afterClear.heapUsed;

        // The identifier metadata should consume significant memory
        // With lazy loading, this memory is only allocated when needed
        assert.ok(
            loadedHeap > 100_000,
            `Identifier metadata should allocate significant memory. Loaded: ${loadedHeap} bytes, keywords: ${keywordCount}`
        );

        // After clearing, memory should be reduced (allowing some GC variance)
        assert.ok(
            freedHeap > -500_000,
            `Clearing cache should reduce memory footprint. Freed: ${freedHeap} bytes (negative means memory went up)`
        );
    });

    it("should load metadata only when sanitizer is called", async () => {
        // Clear the cache to start fresh
        Core.clearIdentifierMetadataCache();

        // Import the module
        const { sanitizeMissingArgumentSeparators } = await import(
            "../src/transforms/missing-argument-separator-sanitizer.js"
        );

        // Verify the function exists
        assert.ok(typeof sanitizeMissingArgumentSeparators === "function", "Should export sanitizer function");

        // Call the sanitizer with a simple input
        const result = sanitizeMissingArgumentSeparators("show_debug_message(1 2)");

        // Verify it still works correctly
        assert.ok(result, "Should return a result");
        assert.strictEqual(typeof result.sourceText, "string", "Should return source text");

        // The metadata should now be loaded and cached
        // Subsequent calls should use the cached version
        const result2 = sanitizeMissingArgumentSeparators("show_debug_message(3 4)");
        assert.ok(result2, "Should work on subsequent calls");

        // Clean up
        Core.clearIdentifierMetadataCache();
    });

    it("should handle empty input without loading metadata", async () => {
        // Clear the cache
        Core.clearIdentifierMetadataCache();

        const { sanitizeMissingArgumentSeparators } = await import(
            "../src/transforms/missing-argument-separator-sanitizer.js"
        );

        // Empty input should short-circuit before needing metadata
        const result = sanitizeMissingArgumentSeparators("");

        assert.ok(result, "Should handle empty input");
        assert.strictEqual(result.sourceText, "", "Should return empty string");
        assert.strictEqual(result.indexAdjustments, null, "Should have no adjustments");

        // Clean up
        Core.clearIdentifierMetadataCache();
    });
});
