import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project-index/index.js";

async function writeProjectFile(rootDir, relativePath, contents) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
}

async function createProjectFixture(prefix = "project-index-metrics-") {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), prefix));

    const manifest = {
        name: "MetricsProject",
        resourceType: "GMProject"
    };

    const scriptDescriptor = {
        resourceType: "GMScript",
        name: "metricsScript"
    };

    await writeProjectFile(
        projectRoot,
        "MetricsProject.yyp",
        JSON.stringify(manifest)
    );

    await writeProjectFile(
        projectRoot,
        "scripts/metricsScript/metricsScript.yy",
        JSON.stringify(scriptDescriptor)
    );

    await writeProjectFile(
        projectRoot,
        "scripts/metricsScript/metricsScript.gml",
        "/// @function metricsScript\nreturn 1;\n"
    );

    return {
        projectRoot,
        async cleanup() {
            await rm(projectRoot, { recursive: true, force: true });
        }
    };
}

class TestMetricsTracker {
    startTimerCalls = 0;

    finalizeCalls = 0;

    startTimer() {
        this.startTimerCalls += 1;
        return () => {};
    }

    async timeAsync(_label, callback) {
        return await callback();
    }

    timeSync(_label, callback) {
        return callback();
    }

    incrementCounter() {}

    setMetadata() {}

    recordCacheHit() {}

    recordCacheMiss() {}

    recordCacheStale() {}

    finalize(extra = {}) {
        this.finalizeCalls += 1;
        return {
            category: "custom-metrics",
            totalTimeMs: 0,
            timings: {},
            counters: {},
            caches: {},
            metadata: { provided: true },
            ...extra
        };
    }

    logSummary() {}
}

test("buildProjectIndex falls back to a noop metrics tracker when override is invalid", async () => {
    const { projectRoot, cleanup } = await createProjectFixture();

    try {
        const index = await buildProjectIndex(projectRoot, undefined, {
            metrics: {}
        });

        assert.deepEqual(index.metrics, {
            category: "project-index",
            totalTimeMs: 0,
            timings: {},
            counters: {},
            caches: {},
            metadata: {}
        });
    } finally {
        await cleanup();
    }
});

test("buildProjectIndex reuses a provided metrics tracker", async () => {
    const { projectRoot, cleanup } = await createProjectFixture();
    const tracker = new TestMetricsTracker();

    try {
        const index = await buildProjectIndex(projectRoot, undefined, {
            metrics: tracker
        });

        assert.ok(
            tracker.startTimerCalls > 0,
            "expected custom metrics tracker to be exercised"
        );
        assert.equal(tracker.finalizeCalls, 1);
        assert.equal(index.metrics.category, "custom-metrics");
        assert.deepEqual(index.metrics.metadata, { provided: true });
    } finally {
        await cleanup();
    }
});
