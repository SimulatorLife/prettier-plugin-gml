import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";

import { createTempFileStorageBackend } from "../src/backends/index.js";

void test("TempFileStorageBackend writes, reads, and deletes entries", async () => {
    const backend = createTempFileStorageBackend({ readCacheMaxEntries: 2 });

    try {
        await backend.writeEntry("alpha", "content-a");
        await backend.writeEntry("beta", "content-b");

        assert.equal(await backend.readEntry("alpha"), "content-a");
        assert.equal(await backend.readEntry("alpha"), "content-a");
        assert.equal(await backend.readEntry("missing"), null);

        await backend.deleteEntry("alpha");
        assert.equal(await backend.readEntry("alpha"), null);

        const stats = backend.getStats();
        assert.ok(stats.writes >= 2);
        assert.ok(stats.reads >= 4);
        assert.ok(stats.cacheHits >= 1);
        assert.ok(stats.cacheMisses >= 1);
    } finally {
        await backend.dispose();
    }
});

void test("TempFileStorageBackend isolates keys that sanitize to the same file prefix", async () => {
    const backend = createTempFileStorageBackend({ readCacheMaxEntries: 2 });

    try {
        await backend.writeEntry("scripts/a-b.gml", "first-content");
        await backend.writeEntry("scripts/a?b.gml", "second-content");

        assert.equal(await backend.readEntry("scripts/a-b.gml"), "first-content");
        assert.equal(await backend.readEntry("scripts/a?b.gml"), "second-content");
        assert.equal(backend.getStats().spilledEntries, 2);
    } finally {
        await backend.dispose();
    }
});

void test("TempFileStorageBackend treats externally removed spill files as cache misses", async () => {
    const backend = createTempFileStorageBackend({ readCacheMaxEntries: 2 });

    try {
        await backend.writeEntry("external-removal", "payload");
        const backingPath = (backend as unknown as { pathByKey: Map<string, string> }).pathByKey.get(
            "external-removal"
        );

        assert.equal(typeof backingPath, "string");
        await rm(backingPath, { force: true });

        assert.equal(await backend.readEntry("external-removal"), null);
    } finally {
        await backend.dispose();
    }
});

void test("TempFileStorageBackend rejects writes after disposal", async () => {
    const backend = createTempFileStorageBackend({ readCacheMaxEntries: 2 });

    await backend.dispose();
    await assert.rejects(async () => {
        await backend.writeEntry("after-dispose", "payload");
    }, /cannot write after dispose/i);
});

void test("TempFileStorageBackend returns null for reads after disposal", async () => {
    const backend = createTempFileStorageBackend({ readCacheMaxEntries: 2 });

    await backend.writeEntry("before-dispose", "payload");
    await backend.dispose();

    assert.equal(await backend.readEntry("before-dispose"), null);
});
