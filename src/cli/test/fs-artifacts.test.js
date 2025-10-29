import assert from "node:assert/strict";
import { test } from "node:test";

import { writeFileArtifact } from "../src/shared/fs-artifacts.js";

test("writeFileArtifact reports a descriptive error when outputPath is missing", async () => {
    await assert.rejects(
        async () =>
            writeFileArtifact({
                outputPath: null,
                contents: "payload"
            }),
        (error) => {
            assert.ok(error instanceof TypeError);
            assert.strictEqual(
                error.message,
                "outputPath must be provided to writeFileArtifact."
            );
            return true;
        }
    );
});
