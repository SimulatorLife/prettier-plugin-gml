import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project-index/index.js";

test("buildProjectIndex excludes built-in script calls", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "project-index-"));
    try {
        await writeFile(path.join(tempRoot, "project.yyp"), "{}", "utf8");

        const objectDir = path.join(tempRoot, "objects", "obj_demo");
        await mkdir(objectDir, { recursive: true });

        const stepPath = path.join(objectDir, "obj_demo_Step_0.gml");
        await writeFile(stepPath, "instance_destroy();\n", "utf8");

        const index = await buildProjectIndex(tempRoot);
        const fileRecord = index.files["objects/obj_demo/obj_demo_Step_0.gml"];

        assert.ok(fileRecord, "expected step event file to be indexed");
        assert.equal(
            fileRecord.scriptCalls.length,
            0,
            "expected built-in calls to be excluded from script references"
        );
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
});
