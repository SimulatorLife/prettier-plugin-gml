import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createTempProjectWorkspace, recordValues } from "./test-project-helpers.js";

void test("createTempProjectWorkspace writes nested project files and cleans them up", async () => {
    const workspace = await createTempProjectWorkspace("semantic-test-workspace-");
    const filePath = await workspace.writeProjectFile("scripts/demo/demo.gml", "return 1;\n");

    assert.equal(path.dirname(filePath).endsWith(path.join("scripts", "demo")), true);
    assert.equal(await fs.readFile(filePath, "utf8"), "return 1;\n");

    await workspace.cleanup();

    await assert.rejects(async () => fs.access(workspace.projectRoot));
});

void test("recordValues returns record values in insertion order", () => {
    assert.deepEqual(recordValues({ alpha: 1, beta: 2, gamma: 3 }), [1, 2, 3]);
});
