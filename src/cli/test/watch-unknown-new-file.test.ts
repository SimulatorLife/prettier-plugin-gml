import assert from "node:assert/strict";
import type { WatchListener } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { fetchStatusPayload, waitForStatus } from "./test-helpers/status-polling.js";
import { createMockWatchFactory } from "./test-helpers/watch-fixtures.js";
import { runWatchTest } from "./test-helpers/watch-runner.js";

void describe("watch command unknown new-file handling", () => {
    void it("discovers new matching files when the watcher omits the filename", async () => {
        const listenerCapture: { listener: WatchListener<string> | undefined } = { listener: undefined };
        const watchFactory = createMockWatchFactory(listenerCapture);

        await runWatchTest(
            "watch-unknown-new-file",
            {
                watchFactory,
                debounceDelay: 0
            },
            async (context) => {
                await waitForStatus(context.baseUrl, (status) => status.scanComplete === true, 2000);

                const beforeStatus = await fetchStatusPayload(context.baseUrl);
                const beforePatchCount = beforeStatus.totalPatchCount ?? 0;

                const newFile = path.join(context.testDir, "new_unknown_file.gml");
                await writeFile(
                    newFile,
                    `function new_unknown_file() {
    return 1;
}`,
                    "utf8"
                );

                assert.ok(listenerCapture.listener, "watch listener should be captured");

                const triggerUnknownEvent = listenerCapture.listener as (eventType: string, filename?: string) => void;
                triggerUnknownEvent("rename");

                const afterStatus = await waitForStatus(
                    context.baseUrl,
                    (status) => (status.totalPatchCount ?? 0) > beforePatchCount,
                    2000
                );

                assert.ok(
                    (afterStatus.totalPatchCount ?? 0) > beforePatchCount,
                    "unknown filename events should discover and transpile new matching files"
                );
            }
        );
    });
});
