import assert from "node:assert/strict";
import type { WatchListener } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { fetchStatusPayload, waitForPatchCount } from "./test-helpers/status-polling.js";
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
                const priorCount = firstStatus.totalPatchCount ?? 0;

                // Fire a duplicate change event. Because the file mtime is
                // unchanged, the watch command should discard it without
                // incrementing the patch count.
                listenerCapture.listener?.("change", path.basename(testFile));

                // To verify the duplicate was skipped without relying on a
                // fixed-duration sleep (a classic "wait for negative" anti-
                // pattern), we fire a change event for a fresh sentinel file
                // on a DIFFERENT path. Since the sentinel operates on a
                // separate file path, its mtime check cannot race with the
                // duplicate's mtime check, making the ordering deterministic.
                //
                // Once the sentinel appears in the status (totalPatchCount
                // reaches priorCount + 1), the entire event pipeline is
                // drained. At that point we can assert the duplicate was
                // never processed — if it had been, the count would be
                // priorCount + 2.
                const sentinelFile = path.join(context.testDir, "sentinel.gml");
                await writeFile(sentinelFile, "var sentinel = 1;", "utf8");
                listenerCapture.listener?.("change", path.basename(sentinelFile));

                await waitForPatchCount(context.baseUrl, priorCount + 1, 2000);

                const finalStatus = await fetchStatusPayload(context.baseUrl);

                assert.equal(
                    finalStatus.totalPatchCount,
                    priorCount + 1,
                    "duplicate event should be skipped; only the sentinel change should increase the patch count"
                );
            }
        );
    });
});
