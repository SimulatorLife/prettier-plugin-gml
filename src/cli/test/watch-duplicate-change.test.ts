import assert from "node:assert/strict";
import type { WatchListener } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { fetchStatusPayload, waitForStatus } from "./test-helpers/status-polling.js";
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
            async ({ baseUrl, testDir }) => {
                await waitForStatus(baseUrl, (status) => status.scanComplete === true, 1000);

                const testFile = path.join(testDir, "script1.gml");
                await writeFile(testFile, "var x = 1;", "utf8");

                assert.ok(listenerCapture.listener, "watch listener should be registered");

                listenerCapture.listener?.("change", path.basename(testFile));
                await waitForStatus(baseUrl, (status) => (status.totalPatchCount ?? 0) >= 1, 1000);

                const firstStatus = await fetchStatusPayload(baseUrl);

                listenerCapture.listener?.("change", path.basename(testFile));
                await new Promise((resolve) => setTimeout(resolve, 150));

                const secondStatus = await fetchStatusPayload(baseUrl);

                assert.equal(
                    secondStatus.totalPatchCount,
                    firstStatus.totalPatchCount,
                    "duplicate events should not increase patch count"
                );
            }
        );
    });
});
