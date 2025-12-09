import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";

import {
    writeFileArtifact,
    writeJsonArtifact
} from "../src/shared/fs-artifacts.js";
import { createWorkflowPathFilter } from "../src/workflow/path-filter.js";

function createTempDirFactory() {
    let counter = 0;

    return async function createTempDir() {
        counter += 1;
        const prefix = path.join(os.tmpdir(), `fs-artifacts-${counter}-`);
        return fs.mkdtemp(prefix);
    };
}

void describe("fs artifacts", () => {
    const createTempDir = createTempDirFactory();
    let tempDir;

    beforeEach(async () => {
        tempDir = await createTempDir();
    });

    void it("writes files after ensuring parent directories exist", async () => {
        const targetPath = path.join(tempDir, "nested", "manual.txt");

        await writeFileArtifact({
            outputPath: targetPath,
            contents: "manual payload"
        });

        const contents = await fs.readFile(targetPath, "utf8");
        assert.equal(contents, "manual payload");
    });

    void it("serializes JSON payloads with a trailing newline", async () => {
        const targetPath = path.join(tempDir, "output", "artefact.json");
        let observed;

        await writeJsonArtifact({
            outputPath: targetPath,
            payload: { answer: 42 },
            onAfterWrite(details) {
                observed = details;
            }
        });

        const contents = await fs.readFile(targetPath, "utf8");
        assert.equal(contents, '{\n  "answer": 42\n}\n');
        assert.deepEqual(observed, {
            outputPath: targetPath,
            contents,
            encoding: "utf8"
        });
    });

    void it("rejects writes outside workflow allow paths", async () => {
        const targetPath = path.join(tempDir, "restricted", "manual.txt");
        const filter = createWorkflowPathFilter({
            denyPaths: [path.join(tempDir, "restricted")]
        });

        await assert.rejects(
            writeFileArtifact({
                outputPath: targetPath,
                contents: "payload",
                pathFilter: filter
            }),
            /Artefact output path '[^']+' is not permitted by workflow path filters\./
        );
    });
});
