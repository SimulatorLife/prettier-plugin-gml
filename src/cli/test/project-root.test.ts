import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { resolveExistingGmloopConfigPath } from "../src/workflow/project-root.js";

const temporaryDirectories: Array<string> = [];

async function createTemporaryDirectory(): Promise<string> {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), "cli-project-root-"));
    temporaryDirectories.push(directoryPath);
    return directoryPath;
}

void describe("resolveExistingGmloopConfigPath", () => {
    afterEach(async () => {
        await Promise.all(
            temporaryDirectories.splice(0).map(async (directoryPath) => {
                await rm(directoryPath, { recursive: true, force: true });
            })
        );
    });

    void it("accepts gmloop.json symlinks that point at files", async () => {
        const projectRoot = await createTemporaryDirectory();
        const actualConfigPath = path.join(projectRoot, "shared-gmloop.json");
        const symlinkConfigPath = path.join(projectRoot, "gmloop.json");

        await writeFile(actualConfigPath, JSON.stringify({ projectRoot }), "utf8");
        await symlink(actualConfigPath, symlinkConfigPath);

        const resolvedConfigPath = await resolveExistingGmloopConfigPath(projectRoot, undefined);

        assert.equal(resolvedConfigPath, symlinkConfigPath);
    });
});
