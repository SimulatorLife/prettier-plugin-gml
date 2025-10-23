import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";

import {
    writeManualFile,
    writeManualJsonArtifact
} from "../features/manual/file-helpers.js";

function createTempDirFactory() {
    let counter = 0;

    return async function createTempDir() {
        counter += 1;
        const prefix = path.join(
            os.tmpdir(),
            `manual-file-helpers-${counter}-`
        );
        return fs.mkdtemp(prefix);
    };
}

describe("manual file helpers", () => {
    const createTempDir = createTempDirFactory();
    let tempDir;

    beforeEach(async () => {
        tempDir = await createTempDir();
    });

    it("writes files after ensuring parent directories exist", async () => {
        const targetPath = path.join(tempDir, "nested", "manual.txt");

        await writeManualFile({
            outputPath: targetPath,
            contents: "manual payload"
        });

        const contents = await fs.readFile(targetPath, "utf8");
        assert.equal(contents, "manual payload");
    });

    it("serializes JSON payloads with a trailing newline", async () => {
        const targetPath = path.join(tempDir, "output", "artefact.json");
        let observed;

        await writeManualJsonArtifact({
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
});
