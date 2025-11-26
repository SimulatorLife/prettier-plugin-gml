import assert from "node:assert/strict";
import test from "node:test";

import { createProjectIndexCoordinator } from "../src/project-index/coordinator.js";

function createProjectIndex(root) {
    return {
        projectRoot: root,
        metrics: null
    };
}

test("createProjectIndexCoordinator uses getDefaultCacheMaxSize when unspecified", async () => {
    await assertCacheMaxSizeScenario({
        defaultMaxSize: 512,
        expectedMaxSize: 512
    });
});

test("createProjectIndexCoordinator prioritises explicit cacheMaxSizeBytes", async () => {
    await assertCacheMaxSizeScenario({
        cacheMaxSizeBytes: 256,
        defaultMaxSize: 1024,
        expectedMaxSize: 256
    });
});

async function assertCacheMaxSizeScenario({
    cacheMaxSizeBytes,
    defaultMaxSize,
    expectedMaxSize
}: {
    cacheMaxSizeBytes?: number;
    defaultMaxSize: number;
    expectedMaxSize: number;
}) {
    const savedDescriptors: Array<{ maxSizeBytes: number }> = [];
    const coordinator = createProjectIndexCoordinator({
        cacheMaxSizeBytes,
        getDefaultCacheMaxSize: () => defaultMaxSize,
        loadCache: async () => ({
            status: "miss",
            cacheFilePath: "virtual-cache.json",
            reason: { type: "not-found" }
        }),
        saveCache: async (descriptor) => {
            savedDescriptors.push(descriptor);
            return {
                status: "written",
                cacheFilePath: "virtual-cache.json",
                size: 0
            };
        },
        buildIndex: async (root) => createProjectIndex(root)
    });

    try {
        await coordinator.ensureReady({ projectRoot: "/project" });
        assert.equal(savedDescriptors.length, 1);
        assert.equal(savedDescriptors[0].maxSizeBytes, expectedMaxSize);
    } finally {
        coordinator.dispose();
    }
}
