import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { __test__ } from "../src/modules/memory/index.js";

const {
    SAMPLE_CACHE_MAX_ENTRIES,
    loadSampleTextForTests,
    clearSampleCacheForTests,
    getSampleCacheLabelsForTests
} = __test__;

async function createSampleFile(directory, label, size = 256 * 1024) {
    const filePath = path.join(directory, `${label}.txt`);
    const payload = "x".repeat(size);
    await fs.writeFile(filePath, payload, "utf8");
    return filePath;
}

describe("memory module sample cache", () => {
    let tempDir;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(
            path.join(os.tmpdir(), "prettier-plugin-gml-memory-cache-")
        );
        clearSampleCacheForTests();
    });

    afterEach(async () => {
        clearSampleCacheForTests();
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
            tempDir = null;
        }
    });

    it("evicts the oldest samples when exceeding the cache capacity", async () => {
        const limit = SAMPLE_CACHE_MAX_ENTRIES;
        const sampleCount = limit + 3;

        for (let index = 0; index < sampleCount; index += 1) {
            const label = `sample-${index}`;
            const filePath = await createSampleFile(tempDir, label);
            const relativePath = path.relative(process.cwd(), filePath);

            const record = await loadSampleTextForTests(label, relativePath);
            assert.equal(record.path, path.resolve(relativePath));
            const labels = getSampleCacheLabelsForTests();

            assert.ok(
                labels.length <= limit,
                `cache should not exceed ${limit} entries (saw ${labels.length})`
            );

            if (index >= limit) {
                const evictedLabel = `sample-${index - limit}`;
                assert.ok(
                    !labels.includes(evictedLabel),
                    `expected ${evictedLabel} to be evicted after inserting ${label}`
                );
            }
        }
    });

    it("refreshes cache entries when samples are reused", async () => {
        const limit = SAMPLE_CACHE_MAX_ENTRIES;
        const labels = [];

        for (let index = 0; index < limit; index += 1) {
            const label = `baseline-${index}`;
            const filePath = await createSampleFile(tempDir, label);
            const relativePath = path.relative(process.cwd(), filePath);
            await loadSampleTextForTests(label, relativePath);
            labels.push({ label, relativePath });
        }

        const [firstEntry] = labels;
        await loadSampleTextForTests(firstEntry.label, firstEntry.relativePath);

        const extraPath = await createSampleFile(tempDir, "extra-1");
        await loadSampleTextForTests(
            "extra-1",
            path.relative(process.cwd(), extraPath)
        );

        const cacheLabels = getSampleCacheLabelsForTests();
        assert.ok(cacheLabels.includes(firstEntry.label));
        assert.ok(!cacheLabels.includes(labels[1].label));
    });
});
