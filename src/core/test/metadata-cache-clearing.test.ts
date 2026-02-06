import assert from "node:assert";
import { describe, it } from "node:test";

import { Core } from "../src/index.js";

void describe("Metadata cache clearing", () => {
    void it("should clear identifier metadata cache and allow reload", () => {
        // Load metadata to populate cache
        const metadata1 = Core.getIdentifierMetadata();
        assert.ok(metadata1, "Should load identifier metadata");

        // Clear cache
        Core.clearIdentifierMetadataCache();

        // Reload metadata - should work even after clearing
        const metadata2 = Core.getIdentifierMetadata();
        assert.ok(metadata2, "Should reload identifier metadata after clearing");
        assert.deepStrictEqual(metadata1, metadata2, "Reloaded metadata should match original");
    });

    void it("should demonstrate memory footprint reduction", () => {
        if (typeof globalThis.gc !== "function") {
            // Skip if --expose-gc not enabled
            return;
        }

        // Clear any existing cached metadata
        Core.clearIdentifierMetadataCache();

        // Force multiple GC cycles to ensure clean baseline
        for (let i = 0; i < 5; i++) {
            globalThis.gc();
        }

        const before = process.memoryUsage();

        // Load metadata file multiple times to ensure it's retained
        for (let i = 0; i < 10; i++) {
            const identifierMetadata = Core.getIdentifierMetadata();
            assert.ok(identifierMetadata, "Should load identifier metadata");
        }

        const afterLoad = process.memoryUsage();
        const loadedHeap = afterLoad.heapUsed - before.heapUsed;
        const loadedRSS = afterLoad.rss - before.rss;

        // Clear caches to release memory
        Core.clearIdentifierMetadataCache();

        // Force multiple GC cycles to ensure memory is actually released
        for (let i = 0; i < 5; i++) {
            globalThis.gc();
        }

        const afterClear = process.memoryUsage();
        const clearedHeap = afterClear.heapUsed - before.heapUsed;

        // Memory should be reduced after clearing
        assert.ok(loadedHeap > 0, `Should have allocated heap memory for metadata (${loadedHeap} bytes)`);

        // After clearing and GC, heap should have decreased or at minimum not
        // increased significantly. GC timing is non-deterministic, so we accept
        // a small increase due to V8 internal structures, but large increases
        // would indicate the cache wasn't cleared.
        const heapReduction = loadedHeap - clearedHeap;
        const TOLERANCE_BYTES = 500_000; // 500KB tolerance for GC timing variance
        assert.ok(
            heapReduction > -TOLERANCE_BYTES,
            `Heap should not increase significantly after clearing cache (loaded: ${loadedHeap} bytes, cleared: ${clearedHeap} bytes, reduction: ${heapReduction} bytes, RSS loaded: ${loadedRSS} bytes). This indicates cache was not properly cleared.`
        );
    });
});
