import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { __test__ } from "../src/cli.js";

const {
    clearFormattingCacheForTests,
    getFormattingCacheKeysForTests,
    getFormattingCacheStatsForTests,
    setFormattingCacheEntryForTests
} = __test__;

void describe("formatting cache", () => {
    beforeEach(() => {
        clearFormattingCacheForTests();
    });

    void it("evicts the oldest entries once the cache exceeds its limit", () => {
        const { maxEntries } = getFormattingCacheStatsForTests();
        const totalEntries = maxEntries + 3;

        for (let index = 0; index < totalEntries; index += 1) {
            const key = `format-cache-key-${index}`;
            setFormattingCacheEntryForTests(key, `formatted-${index}`);

            const stats = getFormattingCacheStatsForTests();
            assert.ok(
                stats.size <= maxEntries,
                `cache should stay at or below ${maxEntries} entries (saw ${stats.size})`
            );

            if (index >= maxEntries) {
                const evictedKey = `format-cache-key-${index - maxEntries}`;
                assert.ok(
                    !getFormattingCacheKeysForTests().includes(evictedKey),
                    `expected ${evictedKey} to be evicted after inserting ${key}`
                );
            }
        }
    });

    void it("tracks estimated cache allocation in bytes", () => {
        const key = "format-cache-key";
        const value = "formatted-value";

        setFormattingCacheEntryForTests(key, value);

        const { estimatedBytes } = getFormattingCacheStatsForTests();
        const expectedBytes = Buffer.byteLength(key, "utf8") + Buffer.byteLength(value, "utf8");

        assert.equal(estimatedBytes, expectedBytes);
    });
});
