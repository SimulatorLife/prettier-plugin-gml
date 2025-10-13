import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
    loadProjectIndexCache,
    saveProjectIndexCache,
    createProjectIndexCoordinator,
    ProjectIndexCacheMissReason,
    PROJECT_INDEX_CACHE_DIRECTORY,
    PROJECT_INDEX_CACHE_FILENAME,
    PROJECT_INDEX_CACHE_SCHEMA_VERSION
} from "../project-index/index.js";

function createProjectIndex(projectRoot, metrics = null) {
    return {
        projectRoot,
        resources: {},
        scopes: {},
        files: {},
        relationships: {},
        identifiers: {},
        metrics
    };
}

async function withTempDir(run) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gml-cache-"));
    try {
        return await run(tempRoot);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
}

test("saveProjectIndexCache writes payload and loadProjectIndexCache returns hit", async () => {
    await withTempDir(async (projectRoot) => {
        const manifestMtimes = { "project.yyp": 100 };
        const sourceMtimes = { "scripts/main.gml": 200 };
        const metrics = { counters: { total: 1 } };
        const projectIndex = createProjectIndex(projectRoot, metrics);

        const saveResult = await saveProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes,
            sourceMtimes,
            projectIndex
        });

        assert.equal(saveResult.status, "written");

        const loadResult = await loadProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes,
            sourceMtimes
        });

        assert.equal(loadResult.status, "hit");
        assert.deepEqual(loadResult.projectIndex.metrics, metrics);
    });
});

test("loadProjectIndexCache reports version mismatches", async () => {
    await withTempDir(async (projectRoot) => {
        const manifestMtimes = { "project.yyp": 100 };
        const sourceMtimes = { "scripts/main.gml": 200 };

        await saveProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes,
            sourceMtimes,
            projectIndex: createProjectIndex(projectRoot)
        });

        const formatterMiss = await loadProjectIndexCache({
            projectRoot,
            formatterVersion: "2.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes,
            sourceMtimes
        });

        assert.equal(formatterMiss.status, "miss");
        assert.equal(
            formatterMiss.reason.type,
            ProjectIndexCacheMissReason.FORMATTER_VERSION_MISMATCH
        );

        const pluginMiss = await loadProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.2.0",
            manifestMtimes,
            sourceMtimes
        });

        assert.equal(pluginMiss.status, "miss");
        assert.equal(
            pluginMiss.reason.type,
            ProjectIndexCacheMissReason.PLUGIN_VERSION_MISMATCH
        );
    });
});

test("loadProjectIndexCache reports mtime invalidations", async () => {
    await withTempDir(async (projectRoot) => {
        await saveProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes: { "project.yyp": 100 },
            sourceMtimes: { "scripts/main.gml": 200 },
            projectIndex: createProjectIndex(projectRoot)
        });

        const manifestMiss = await loadProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes: { "project.yyp": 150 },
            sourceMtimes: { "scripts/main.gml": 200 }
        });

        assert.equal(manifestMiss.status, "miss");
        assert.equal(
            manifestMiss.reason.type,
            ProjectIndexCacheMissReason.MANIFEST_MTIME_MISMATCH
        );

        const sourceMiss = await loadProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes: { "project.yyp": 100 },
            sourceMtimes: { "scripts/main.gml": 250 }
        });

        assert.equal(sourceMiss.status, "miss");
        assert.equal(
            sourceMiss.reason.type,
            ProjectIndexCacheMissReason.SOURCE_MTIME_MISMATCH
        );
    });
});

test("loadProjectIndexCache handles corrupted cache payloads", async () => {
    await withTempDir(async (projectRoot) => {
        const cacheDir = path.join(projectRoot, PROJECT_INDEX_CACHE_DIRECTORY);
        await mkdir(cacheDir, { recursive: true });
        const cacheFilePath = path.join(cacheDir, PROJECT_INDEX_CACHE_FILENAME);

        await writeFile(cacheFilePath, "{ invalid", "utf8");

        const result = await loadProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes: { "project.yyp": 100 },
            sourceMtimes: { "scripts/main.gml": 200 }
        });

        assert.equal(result.status, "miss");
        assert.equal(
            result.reason.type,
            ProjectIndexCacheMissReason.INVALID_JSON
        );
    });
});

test("createProjectIndexCoordinator serialises builds for the same project", async () => {
    const storedPayloads = new Map();
    let buildCount = 0;
    const cacheFilePath = path.join(os.tmpdir(), "virtual-cache.json");

    const coordinator = createProjectIndexCoordinator({
        loadCache: async (descriptor) => {
            const key = path.resolve(descriptor.projectRoot);
            const payload = storedPayloads.get(key);
            if (!payload) {
                return {
                    status: "miss",
                    cacheFilePath,
                    reason: { type: ProjectIndexCacheMissReason.NOT_FOUND }
                };
            }

            const projectIndex = {
                ...payload.projectIndex
            };
            if (payload.metricsSummary != null) {
                projectIndex.metrics = payload.metricsSummary;
            }

            return {
                status: "hit",
                cacheFilePath,
                payload,
                projectIndex
            };
        },
        saveCache: async (descriptor) => {
            const key = path.resolve(descriptor.projectRoot);
            storedPayloads.set(key, {
                schemaVersion: PROJECT_INDEX_CACHE_SCHEMA_VERSION,
                projectRoot: key,
                formatterVersion: descriptor.formatterVersion,
                pluginVersion: descriptor.pluginVersion,
                manifestMtimes: { ...descriptor.manifestMtimes },
                sourceMtimes: { ...descriptor.sourceMtimes },
                metricsSummary: descriptor.projectIndex.metrics ?? null,
                projectIndex: { ...descriptor.projectIndex }
            });
            return { status: "written", cacheFilePath, size: 10 };
        },
        buildIndex: async (root) => {
            buildCount += 1;
            await new Promise((resolve) => setTimeout(resolve, 20));
            return createProjectIndex(root, { buildCount });
        }
    });

    const descriptor = {
        projectRoot: path.join(os.tmpdir(), "shared-project"),
        formatterVersion: "1.0.0",
        pluginVersion: "0.1.0",
        manifestMtimes: { "project.yyp": 100 },
        sourceMtimes: { "scripts/main.gml": 200 }
    };

    try {
        const [first, second] = await Promise.all([
            coordinator.ensureReady(descriptor),
            coordinator.ensureReady(descriptor)
        ]);

        assert.equal(buildCount, 1);
        assert.equal(first.source, "build");
        assert.strictEqual(first.projectIndex, second.projectIndex);
        assert.equal(first.cache.saveResult.status, "written");

        const cacheHit = await coordinator.ensureReady(descriptor);
        assert.equal(cacheHit.source, "cache");
        assert.equal(buildCount, 1);
    } finally {
        coordinator.dispose();
    }

    await assert.rejects(coordinator.ensureReady(descriptor), /disposed/i);
});
