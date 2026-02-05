import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runFileRemovalTest } from "./test-helpers/watch-file-removal.js";

void describe("Watch command file removal on change events", () => {
    void it("clears dependency tracking when a file disappears before a change event is handled", async () => {
        const { removedFilePath, targetFile } = await runFileRemovalTest({
            tmpPrefix: "watch-file-removal-change-",
            eventType: "change"
        });

        assert.equal(removedFilePath, targetFile, "dependency tracking should be cleared for removed file");
    });
});
