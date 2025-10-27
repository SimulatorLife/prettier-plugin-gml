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
    const savedDescriptors = [];
    const coordinator = createProjectIndexCoordinator({
        getDefaultCacheMaxSize: () => 512,
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
        assert.equal(savedDescriptors[0].maxSizeBytes, 512);
    } finally {
        coordinator.dispose();
    }
});

test("createProjectIndexCoordinator prioritises explicit cacheMaxSizeBytes", async () => {
    const savedDescriptors = [];
    const coordinator = createProjectIndexCoordinator({
        cacheMaxSizeBytes: 256,
        getDefaultCacheMaxSize: () => 1024,
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
        assert.equal(savedDescriptors[0].maxSizeBytes, 256);
    } finally {
        coordinator.dispose();
    }
});
