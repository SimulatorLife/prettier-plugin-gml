import assert from "node:assert/strict";
import type { WatchListener } from "node:fs";
import { writeFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { fetchStatusPayload, waitForStatus } from "./test-helpers/status-polling.js";
import { setupWatchChangeTest } from "./test-helpers/watch-change-setup.js";
import { createMockWatchFactory } from "./test-helpers/watch-fixtures.js";
import { runWatchTest } from "./test-helpers/watch-runner.js";

void describe("watch command unknown change coalescing", () => {
    void it("coalesces concurrent unknown filename scans to avoid duplicate patches", async () => {
        const listenerCapture: { listener: WatchListener<string> | undefined } = { listener: undefined };
        const watchFactory = createMockWatchFactory(listenerCapture);

        await runWatchTest(
            "watch-unknown-change-coalescing",
            {
                watchFactory,
                debounceDelay: 0
            },
            async (context) => {
                const { testFile, firstStatus } = await setupWatchChangeTest(context, listenerCapture);

                await writeFile(testFile, "var x = 2;", "utf8");

                const triggerUnknownEvent = listenerCapture.listener as (eventType: string, filename?: string) => void;
                triggerUnknownEvent("change");
                triggerUnknownEvent("change");

                const secondStatus = await waitForStatus(
                    context.baseUrl,
                    (status) => (status.totalPatchCount ?? 0) > (firstStatus.totalPatchCount ?? 0),
                    1000
                );

                await new Promise((resolve) => setTimeout(resolve, 150));
                const settledStatus = await fetchStatusPayload(context.baseUrl);

                assert.equal(
                    settledStatus.totalPatchCount,
                    secondStatus.totalPatchCount,
                    "duplicate unknown events should not create additional patches"
                );
            }
        );
    });
});
