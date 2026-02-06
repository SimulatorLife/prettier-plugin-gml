import assert from "node:assert/strict";
import type { WatchListener } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { fetchStatusPayload } from "./test-helpers/status-polling.js";
import { setupWatchChangeTest } from "./test-helpers/watch-change-setup.js";
import { createMockWatchFactory } from "./test-helpers/watch-fixtures.js";
import { runWatchTest } from "./test-helpers/watch-runner.js";

void describe("watch command duplicate change handling", () => {
    void it("skips duplicate change events when file mtime is unchanged", async () => {
        const listenerCapture: { listener: WatchListener<string> | undefined } = { listener: undefined };
        const watchFactory = createMockWatchFactory(listenerCapture);

        await runWatchTest(
            "watch-duplicate-change",
            {
                watchFactory,
                debounceDelay: 0
            },
            async (context) => {
                const { testFile, firstStatus } = await setupWatchChangeTest(context, listenerCapture);

                listenerCapture.listener?.("change", path.basename(testFile));
                await new Promise((resolve) => setTimeout(resolve, 150));

                const secondStatus = await fetchStatusPayload(context.baseUrl);

                assert.equal(
                    secondStatus.totalPatchCount,
                    firstStatus.totalPatchCount,
                    "duplicate events should not increase patch count"
                );
            }
        );
    });
});
