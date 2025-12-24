import { describe, it } from "node:test";
import assert from "node:assert";
import { Core } from "../src/index.js";

describe("Metadata cache clearing", () => {
    it("should clear feather metadata cache and allow reload", () => {
        // Load metadata to populate cache
        const metadata1 = Core.getFeatherMetadata();
        assert.ok(metadata1, "Should load feather metadata");
        assert.ok(
            Array.isArray(metadata1.diagnostics),
            "Should have diagnostics array"
        );

        // Clear cache
        Core.clearFeatherMetadataCache();

        // Reload metadata - should work even after clearing
        const metadata2 = Core.getFeatherMetadata();
        assert.ok(metadata2, "Should reload feather metadata after clearing");
        assert.deepStrictEqual(
            metadata1.diagnostics,
            metadata2.diagnostics,
            "Reloaded metadata should match original"
        );
    });

    it("should clear identifier metadata cache and allow reload", () => {
        // Load metadata to populate cache
        const metadata1 = Core.getIdentifierMetadata();
        assert.ok(metadata1, "Should load identifier metadata");

        // Clear cache
        Core.clearIdentifierMetadataCache();

        // Reload metadata - should work even after clearing
        const metadata2 = Core.getIdentifierMetadata();
        assert.ok(
            metadata2,
            "Should reload identifier metadata after clearing"
        );
        assert.deepStrictEqual(
            metadata1,
            metadata2,
            "Reloaded metadata should match original"
        );
    });

    it("should demonstrate memory footprint reduction", () => {
        if (typeof globalThis.gc !== "function") {
            // Skip if --expose-gc not enabled
            return;
        }

        // Clear any existing cached metadata
        Core.clearIdentifierMetadataCache();
        Core.clearFeatherMetadataCache();

        // Force multiple GC cycles to ensure clean baseline
        for (let i = 0; i < 5; i++) {
            globalThis.gc();
        }

        const before = process.memoryUsage();

        // Load both metadata files multiple times to ensure they're retained
        for (let i = 0; i < 10; i++) {
            const identifierMetadata = Core.getIdentifierMetadata();
            const featherMetadata = Core.getFeatherMetadata();
            assert.ok(identifierMetadata, "Should load identifier metadata");
            assert.ok(featherMetadata, "Should load feather metadata");
        }

        const afterLoad = process.memoryUsage();
        const loadedHeap = afterLoad.heapUsed - before.heapUsed;
        const loadedRSS = afterLoad.rss - before.rss;

        // Clear caches to release memory
        Core.clearIdentifierMetadataCache();
        Core.clearFeatherMetadataCache();

        // Force multiple GC cycles to ensure memory is actually released
        for (let i = 0; i < 5; i++) {
            globalThis.gc();
        }

        const afterClear = process.memoryUsage();
        const clearedHeap = afterClear.heapUsed - before.heapUsed;

        // Memory should be reduced after clearing
        assert.ok(
            loadedHeap > 0,
            `Should have allocated heap memory for metadata (${loadedHeap} bytes)`
        );

        // After clearing and GC, heap should have decreased
        const heapReduction = loadedHeap - clearedHeap;
        assert.ok(
            heapReduction > 0,
            `Heap should decrease after clearing cache (loaded: ${loadedHeap} bytes, cleared: ${clearedHeap} bytes, reduction: ${heapReduction} bytes, RSS loaded: ${loadedRSS} bytes)`
        );
    });
});
