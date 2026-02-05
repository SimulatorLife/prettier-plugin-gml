import assert from "node:assert/strict";
import type { WatchListener } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { fetchStatusPayload, waitForStatus } from "./status-polling.js";
import type { WatchTestContext } from "./watch-runner.js";

export interface WatchChangeTestSetup {
    testFile: string;
    firstStatus: Awaited<ReturnType<typeof fetchStatusPayload>>;
}

/**
 * Shared test helper for watch change event tests.
 * Waits for initial scan, writes a test file, triggers a change event, and returns the first status.
 */
export async function setupWatchChangeTest(
    context: WatchTestContext,
    listenerCapture: { listener: WatchListener<string> | undefined }
): Promise<WatchChangeTestSetup> {
    const { baseUrl, testDir } = context;

    await waitForStatus(baseUrl, (status) => status.scanComplete === true, 1000);

    const testFile = path.join(testDir, "script1.gml");
    await writeFile(testFile, "var x = 1;", "utf8");

    assert.ok(listenerCapture.listener, "watch listener should be registered");

    listenerCapture.listener?.("change", path.basename(testFile));
    await waitForStatus(baseUrl, (status) => (status.totalPatchCount ?? 0) >= 1, 1000);

    const firstStatus = await fetchStatusPayload(baseUrl);

    return { testFile, firstStatus };
}
