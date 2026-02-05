import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { runFileRemovalTest } from "./test-helpers/watch-file-removal.js";

void describe("Watch command file removal", () => {
    void it("removes dependency tracking when a watched file is deleted", async () => {
        const { removedFilePath } = await runFileRemovalTest({
            tmpPrefix: "watch-file-removal-",
            eventType: "rename"
        });

        const expectedPath = path.join(path.dirname(removedFilePath ?? ""), "script1.gml");
        assert.equal(removedFilePath, expectedPath, "dependency tracking should be cleared for removed file");
    });
});
