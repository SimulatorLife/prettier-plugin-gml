import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project-index/index.js";

type ProjectIndexSnapshot = {
    identifiers: Record<string, unknown>;
    metrics?: {
        counters?: Record<string, number>;
    };
};

async function writeProjectFile(projectRoot: string, relativePath: string, contents: string): Promise<void> {
    const absolutePath = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
}

async function createStreamingFixture(): Promise<{ projectRoot: string; cleanup: () => Promise<void> }> {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "project-index-streaming-"));

    await writeProjectFile(projectRoot, "StreamingProject.yyp", JSON.stringify({ name: "StreamingProject" }));

    await writeProjectFile(
        projectRoot,
        "scripts/streaming_script/streaming_script.yy",
        JSON.stringify({ resourceType: "GMScript", name: "streaming_script" })
    );

    await writeProjectFile(
        projectRoot,
        "scripts/streaming_script/streaming_script.gml",
        [
            "#macro STREAMING_MACRO 1",
            "globalvar stream_global;",
            "function streaming_script() {",
            "    var i = 0;",
            "    i += STREAMING_MACRO;",
            "    i += STREAMING_MACRO;",
            "    i += STREAMING_MACRO;",
            "    stream_global = i;",
            "    stream_global = stream_global + STREAMING_MACRO;",
            "    return i;",
            "}",
            ""
        ].join("\n")
    );

    return {
        projectRoot,
        cleanup: async () => {
            await rm(projectRoot, { recursive: true, force: true });
        }
    };
}

void test("buildProjectIndex streaming sink matches in-memory identifier snapshot", async () => {
    const fixture = await createStreamingFixture();

    try {
        const baseline = (await buildProjectIndex(fixture.projectRoot)) as ProjectIndexSnapshot;
        const streaming = (await buildProjectIndex(fixture.projectRoot, undefined, {
            identifierSink: {
                enabled: true,
                flushThreshold: 2,
                retainedEntriesPerKey: 1,
                readCacheMaxEntries: 1
            }
        })) as ProjectIndexSnapshot;

        assert.deepEqual(streaming.identifiers, baseline.identifiers);
    } finally {
        await fixture.cleanup();
    }
});

void test("buildProjectIndex streaming sink records spill telemetry counters", async () => {
    const fixture = await createStreamingFixture();

    try {
        const streaming = (await buildProjectIndex(fixture.projectRoot, undefined, {
            identifierSink: {
                enabled: true,
                flushThreshold: 2,
                retainedEntriesPerKey: 1,
                readCacheMaxEntries: 1
            }
        })) as ProjectIndexSnapshot;

        const counters = streaming.metrics?.counters ?? {};
        assert.ok((counters["identifiers.appended"] ?? 0) > 0);
        assert.ok((counters["identifiers.spilled"] ?? 0) > 0);
    } finally {
        await fixture.cleanup();
    }
});
