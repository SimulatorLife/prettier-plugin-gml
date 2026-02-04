import assert from "node:assert/strict";
import type { WatchListener } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { fetchStatusPayload, waitForStatus } from "./test-helpers/status-polling.js";
import { createMockWatchFactory } from "./test-helpers/watch-fixtures.js";
import { runWatchTest } from "./test-helpers/watch-runner.js";

void describe("watch command unknown change handling", () => {
    void it("processes changes when watcher omits the filename", async () => {
        const listenerCapture: { listener: WatchListener<string> | undefined } = { listener: undefined };
        const watchFactory = createMockWatchFactory(listenerCapture);

        await runWatchTest(
            "watch-unknown-change",
            {
                watchFactory,
                debounceDelay: 0
            },
            async ({ baseUrl, testDir }) => {
                await waitForStatus(baseUrl, (status) => status.scanComplete === true, 1000);

                const testFile = path.join(testDir, "script1.gml");
                await writeFile(testFile, "var x = 1;", "utf8");

                assert.ok(listenerCapture.listener, "watch listener should be registered");

                listenerCapture.listener?.("change", path.basename(testFile));
                await waitForStatus(baseUrl, (status) => (status.totalPatchCount ?? 0) >= 1, 1000);

                const firstStatus = await fetchStatusPayload(baseUrl);

                await writeFile(testFile, "var x = 2;", "utf8");

                const triggerUnknownEvent = listenerCapture.listener as (eventType: string, filename?: string) => void;
                triggerUnknownEvent("change");

                const secondStatus = await waitForStatus(
                    baseUrl,
                    (status) => (status.totalPatchCount ?? 0) > (firstStatus.totalPatchCount ?? 0),
                    1000
                );

                assert.ok(
                    (secondStatus.totalPatchCount ?? 0) > (firstStatus.totalPatchCount ?? 0),
                    "unknown filename events should still process changes"
                );
            }
        );
    });
});
