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
    PROJECT_INDEX_CACHE_SCHEMA_VERSION,
    PROJECT_INDEX_CACHE_MAX_SIZE_BASELINE,
    PROJECT_INDEX_CACHE_MAX_SIZE_ENV_VAR,
    getDefaultProjectIndexCacheMaxSize,
    setDefaultProjectIndexCacheMaxSize,
    applyProjectIndexCacheEnvOverride
} from "../src/project-index/index.js";
import { bootstrapProjectIndex } from "../src/project-index/bootstrap.js";

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

function createDeferred() {
    let resolve;
    const promise = new Promise((_resolve) => {
        resolve = _resolve;
    });
    return { promise, resolve };
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

test("saveProjectIndexCache normalizes mtime maps to finite numbers", async () => {
    await withTempDir(async (projectRoot) => {
        const manifestMtimes = {
            "project.yyp": "101",
            "project-alt.yyp": 0,
            "ignore-nan": "NaN",
            "ignore-infinity": Number.POSITIVE_INFINITY
        };
        const sourceMtimes = {
            "scripts/a.gml": 200,
            "scripts/b.gml": "300",
            "scripts/c.gml": "-42.5",
            "scripts/ignored.gml": undefined
        };

        const saveResult = await saveProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes,
            sourceMtimes,
            projectIndex: createProjectIndex(projectRoot)
        });

        assert.equal(saveResult.status, "written");

        const loadResult = await loadProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0"
        });

        assert.equal(loadResult.status, "hit");
        assert.deepEqual(loadResult.payload.manifestMtimes, {
            "project.yyp": 101,
            "project-alt.yyp": 0
        });
        assert.deepEqual(loadResult.payload.sourceMtimes, {
            "scripts/a.gml": 200,
            "scripts/b.gml": 300,
            "scripts/c.gml": -42.5
        });
    });
});

test("saveProjectIndexCache respects maxSizeBytes overrides", async () => {
    await withTempDir(async (projectRoot) => {
        const saveResult = await saveProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes: {},
            sourceMtimes: {},
            projectIndex: createProjectIndex(projectRoot),
            maxSizeBytes: 1
        });

        assert.equal(saveResult.status, "skipped");
        assert.equal(saveResult.reason, "payload-too-large");
        assert.ok(saveResult.size > 1);
    });
});

test("saveProjectIndexCache allows unlimited size when maxSizeBytes is 0", async () => {
    await withTempDir(async (projectRoot) => {
        const projectIndex = createProjectIndex(projectRoot);

        const saveResult = await saveProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes: {},
            sourceMtimes: {},
            projectIndex,
            maxSizeBytes: 0
        });

        assert.equal(saveResult.status, "written");

        const loadResult = await loadProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0"
        });

        assert.equal(loadResult.status, "hit");
        assert.deepEqual(loadResult.projectIndex, projectIndex);
    });
});

test("bootstrapProjectIndex normalizes cache max size overrides", async () => {
    await withTempDir(async (projectRoot) => {
        const manifestPath = path.join(projectRoot, "project.yyp");
        await writeFile(manifestPath, "{}");
        const scriptsDir = path.join(projectRoot, "scripts");
        await mkdir(scriptsDir, { recursive: true });
        const scriptPath = path.join(scriptsDir, "main.gml");
        await writeFile(scriptPath, "// script\n");

        async function runCase(rawValue) {
            const descriptors = [];
            const coordinator = {
                async ensureReady(descriptor) {
                    descriptors.push(descriptor);
                    return { projectIndex: null, source: null, cache: null };
                },
                dispose() {}
            };

            const options = {
                filepath: scriptPath,
                __identifierCaseProjectIndexCoordinator: coordinator
            };
            if (rawValue !== undefined) {
                options.gmlIdentifierCaseProjectIndexCacheMaxBytes = rawValue;
            }

            await bootstrapProjectIndex(options);

            return { options, descriptor: descriptors[0] ?? {} };
        }

        {
            const { options, descriptor } = await runCase("16");
            assert.equal(options.__identifierCaseProjectIndexCacheMaxBytes, 16);
            assert.equal(descriptor.maxSizeBytes, 16);
        }

        {
            const { options, descriptor } = await runCase("0");
            assert.strictEqual(
                options.__identifierCaseProjectIndexCacheMaxBytes,
                null
            );
            assert.strictEqual(descriptor.maxSizeBytes, null);
        }

        {
            const { options, descriptor } = await runCase(" ");
            assert.equal(
                Object.prototype.hasOwnProperty.call(
                    options,
                    "__identifierCaseProjectIndexCacheMaxBytes"
                ),
                false
            );
            assert.equal("maxSizeBytes" in descriptor, false);
        }
    });
});

test("bootstrapProjectIndex normalizes concurrency overrides", async () => {
    await withTempDir(async (projectRoot) => {
        const manifestPath = path.join(projectRoot, "project.yyp");
        await writeFile(manifestPath, "{}");
        const scriptsDir = path.join(projectRoot, "scripts");
        await mkdir(scriptsDir, { recursive: true });
        const scriptPath = path.join(scriptsDir, "main.gml");
        await writeFile(scriptPath, "// script\n");

        async function runCase(rawValue) {
            const descriptors = [];
            const coordinator = {
                async ensureReady(descriptor) {
                    descriptors.push(descriptor);
                    return { projectIndex: null, source: null, cache: null };
                },
                dispose() {}
            };

            const options = {
                filepath: scriptPath,
                __identifierCaseProjectIndexCoordinator: coordinator
            };

            if (rawValue !== undefined) {
                options.gmlIdentifierCaseProjectIndexConcurrency = rawValue;
            }

            await bootstrapProjectIndex(options);

            return { options, descriptor: descriptors[0] ?? {} };
        }

        {
            const { options, descriptor } = await runCase("8");
            assert.equal(options.__identifierCaseProjectIndexConcurrency, 8);
            assert.equal(descriptor.buildOptions?.concurrency?.gml, 8);
            assert.equal(descriptor.buildOptions?.concurrency?.gmlParsing, 8);
        }

        {
            const { options, descriptor } = await runCase("   ");
            assert.equal(
                Object.prototype.hasOwnProperty.call(
                    options,
                    "__identifierCaseProjectIndexConcurrency"
                ),
                false
            );
            assert.equal(descriptor.buildOptions?.concurrency, undefined);
        }

        await assert.rejects(runCase("0"));
        await assert.rejects(runCase(-2));
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

test("loadProjectIndexCache tolerates sub-millisecond mtime noise", async () => {
    await withTempDir(async (projectRoot) => {
        const manifestBase = 1_700_000_000_000;
        const manifestMtimes = {
            "project.yyp": manifestBase + 0.1234
        };
        const sourceBase = 1_700_000_000_500;
        const sourceMtimes = {
            "scripts/main.gml": sourceBase + 0.5678
        };

        await saveProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes,
            sourceMtimes,
            projectIndex: createProjectIndex(projectRoot)
        });

        const loadResult = await loadProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes: {
                "project.yyp": manifestMtimes["project.yyp"] + 0.0004
            },
            sourceMtimes: {
                "scripts/main.gml": sourceMtimes["scripts/main.gml"] - 0.0003
            }
        });

        assert.equal(loadResult.status, "hit");
    });
});

test("loadProjectIndexCache treats differently ordered mtime maps as equal", async () => {
    await withTempDir(async (projectRoot) => {
        await saveProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes: {
                "project.yyp": 100,
                "assets/project_extra.yyp": 200
            },
            sourceMtimes: {
                "scripts/main.gml": 300,
                "scripts/secondary.gml": 400
            },
            projectIndex: createProjectIndex(projectRoot)
        });

        const loadResult = await loadProjectIndexCache({
            projectRoot,
            formatterVersion: "1.0.0",
            pluginVersion: "0.1.0",
            manifestMtimes: {
                "assets/project_extra.yyp": 200,
                "project.yyp": 100
            },
            sourceMtimes: {
                "scripts/secondary.gml": 400,
                "scripts/main.gml": 300
            }
        });

        assert.equal(loadResult.status, "hit");
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
        assert.ok(result.reason.error instanceof SyntaxError);
        assert.equal(result.reason.error.name, "JsonParseError");
        assert.match(
            result.reason.error.message,
            /Failed to parse project index cache/
        );
    });
});

test("createProjectIndexCoordinator serialises builds for the same project", async () => {
    const storedPayloads = new Map();
    let buildCount = 0;
    const cacheFilePath = path.join(os.tmpdir(), "virtual-cache.json");
    // The test previously relied on real timers to keep the first build pending
    // long enough for a concurrent ensureReady call to observe the shared
    // in-flight promise. That approach was prone to races when event loop
    // scheduling varied, so explicit deferred promises keep the orchestration
    // deterministic.
    const buildHasStarted = createDeferred();
    const releaseBuild = createDeferred();

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
            if (payload.metricsSummary != undefined) {
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
            buildHasStarted.resolve();
            await releaseBuild.promise;
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
        const firstPromise = coordinator.ensureReady(descriptor);
        await buildHasStarted.promise;
        const secondPromise = coordinator.ensureReady(descriptor);

        releaseBuild.resolve();

        const [first, second] = await Promise.all([
            firstPromise,
            secondPromise
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

test("createProjectIndexCoordinator aborts in-flight builds on dispose", async () => {
    const cacheFilePath = path.join(os.tmpdir(), "virtual-cache.json");
    const buildStarted = createDeferred();
    let saveCalls = 0;

    const coordinator = createProjectIndexCoordinator({
        loadCache: async () => ({
            status: "miss",
            cacheFilePath,
            reason: { type: ProjectIndexCacheMissReason.NOT_FOUND }
        }),
        saveCache: async () => {
            saveCalls += 1;
            return { status: "written", cacheFilePath, size: 1 };
        },
        buildIndex: async (root, fsFacade, options = {}) => {
            buildStarted.resolve(options.signal ?? null);

            await new Promise((_resolve, reject) => {
                const { signal } = options;
                if (!signal) {
                    reject(new Error("Expected abort signal"));
                    return;
                }

                if (signal.aborted) {
                    reject(signal.reason ?? new Error("aborted"));
                    return;
                }

                const onAbort = () => {
                    signal.removeEventListener("abort", onAbort);
                    reject(signal.reason ?? new Error("aborted"));
                };
                signal.addEventListener("abort", onAbort, { once: true });
            });

            return createProjectIndex(root);
        }
    });

    const descriptor = {
        projectRoot: path.join(os.tmpdir(), "dispose-project"),
        formatterVersion: "1.0.0",
        pluginVersion: "0.1.0",
        manifestMtimes: { "project.yyp": 100 },
        sourceMtimes: { "scripts/main.gml": 200 }
    };

    const ensurePromise = coordinator.ensureReady(descriptor);
    const signal = await buildStarted.promise;
    assert.ok(signal, "Expected buildIndex to receive an abort signal");

    coordinator.dispose();

    await assert.rejects(ensurePromise, /disposed/i);
    assert.equal(saveCalls, 0, "Cache writes should not occur after dispose");
});

test("createProjectIndexCoordinator forwards configured cacheMaxSizeBytes", async () => {
    const savedDescriptors = [];
    const coordinator = createProjectIndexCoordinator({
        cacheMaxSizeBytes: 42,
        loadCache: async () => ({
            status: "miss",
            cacheFilePath: "virtual-cache.json",
            reason: { type: ProjectIndexCacheMissReason.NOT_FOUND }
        }),
        saveCache: async (descriptor) => {
            savedDescriptors.push(descriptor);
            return {
                status: "written",
                cacheFilePath: descriptor.cacheFilePath ?? "virtual-cache.json",
                size: 0
            };
        },
        buildIndex: async () => createProjectIndex("/project")
    });

    await coordinator.ensureReady({ projectRoot: "/project" });

    assert.equal(savedDescriptors.length, 1);
    assert.equal(savedDescriptors[0].maxSizeBytes, 42);
    coordinator.dispose();
});

test("createProjectIndexCoordinator allows descriptor maxSizeBytes overrides", async () => {
    const savedDescriptors = [];
    const coordinator = createProjectIndexCoordinator({
        cacheMaxSizeBytes: 42,
        loadCache: async () => ({
            status: "miss",
            cacheFilePath: "virtual-cache.json",
            reason: { type: ProjectIndexCacheMissReason.NOT_FOUND }
        }),
        saveCache: async (descriptor) => {
            savedDescriptors.push(descriptor);
            return {
                status: "written",
                cacheFilePath: descriptor.cacheFilePath ?? "virtual-cache.json",
                size: 0
            };
        },
        buildIndex: async () => createProjectIndex("/project")
    });

    await coordinator.ensureReady({
        projectRoot: "/project",
        maxSizeBytes: 99
    });

    assert.equal(savedDescriptors.length, 1);
    assert.equal(savedDescriptors[0].maxSizeBytes, 99);
    coordinator.dispose();
});

// The tests below all exercise the global default cache size. When they ran in
// parallel the shared default from one case could bleed into another, leading
// to assertions that intermittently observed a mutated baseline. Running them
// sequentially keeps the shared state deterministic without relying on timing
// quirks or the test scheduler's execution order.
test.describe(
    "project index cache default size overrides",
    { concurrency: false },
    () => {
        test("project index cache max size can be tuned programmatically", () => {
            const originalMax = getDefaultProjectIndexCacheMaxSize();

            try {
                const baseline = setDefaultProjectIndexCacheMaxSize(
                    PROJECT_INDEX_CACHE_MAX_SIZE_BASELINE
                );
                assert.equal(baseline, PROJECT_INDEX_CACHE_MAX_SIZE_BASELINE);

                const lowered = setDefaultProjectIndexCacheMaxSize(1024);
                assert.equal(lowered, 1024);
                assert.equal(getDefaultProjectIndexCacheMaxSize(), 1024);

                const reset =
                    setDefaultProjectIndexCacheMaxSize("not-a-number");
                assert.equal(reset, PROJECT_INDEX_CACHE_MAX_SIZE_BASELINE);
                assert.equal(
                    getDefaultProjectIndexCacheMaxSize(),
                    PROJECT_INDEX_CACHE_MAX_SIZE_BASELINE
                );

                const unlimited = setDefaultProjectIndexCacheMaxSize(0);
                assert.equal(unlimited, PROJECT_INDEX_CACHE_MAX_SIZE_BASELINE);
            } finally {
                setDefaultProjectIndexCacheMaxSize(originalMax);
            }
        });

        test("environment overrides apply before using cache max size default", () => {
            const originalMax = getDefaultProjectIndexCacheMaxSize();

            try {
                applyProjectIndexCacheEnvOverride({
                    [PROJECT_INDEX_CACHE_MAX_SIZE_ENV_VAR]: "2048"
                });

                assert.equal(getDefaultProjectIndexCacheMaxSize(), 2048);
            } finally {
                setDefaultProjectIndexCacheMaxSize(originalMax);
            }
        });

        test("createProjectIndexCoordinator uses configured default cache max size", async () => {
            const originalMax = getDefaultProjectIndexCacheMaxSize();
            let coordinator = null;

            try {
                setDefaultProjectIndexCacheMaxSize(4096);

                const savedDescriptors = [];
                coordinator = createProjectIndexCoordinator({
                    loadCache: async () => ({
                        status: "miss",
                        cacheFilePath: "virtual-cache.json",
                        reason: { type: ProjectIndexCacheMissReason.NOT_FOUND }
                    }),
                    saveCache: async (descriptor) => {
                        savedDescriptors.push(descriptor);
                        return {
                            status: "written",
                            cacheFilePath:
                                descriptor.cacheFilePath ??
                                "virtual-cache.json",
                            size: 0
                        };
                    },
                    buildIndex: async () => createProjectIndex("/project")
                });

                await coordinator.ensureReady({ projectRoot: "/project" });

                assert.equal(savedDescriptors.length, 1);
                assert.equal(savedDescriptors[0].maxSizeBytes, 4096);
            } finally {
                setDefaultProjectIndexCacheMaxSize(originalMax);
                coordinator?.dispose();
            }
        });
    }
);
