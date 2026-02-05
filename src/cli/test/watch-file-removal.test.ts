import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runFileRemovalTest } from "./test-helpers/watch-file-removal.js";

void describe("Watch command file removal", () => {
    void it("removes dependency tracking when a watched file is deleted", async () => {
        const { removedFilePath, targetFile } = await runFileRemovalTest({
            tmpPrefix: "watch-file-removal-",
            eventType: "rename"
        });

        assert.equal(removedFilePath, targetFile, "dependency tracking should be cleared for removed file");
    });
});
