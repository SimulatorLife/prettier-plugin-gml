/**
 * Tests for the source-content hash guard in the watch command.
 *
 * When a file's mtime advances but its bytes are unchanged (e.g. an editor
 * performs a no-op save, or `touch` is called), the mtime-based guard lets the
 * event through.  The content hash guard then fires and skips the expensive
 * ANTLR parse + transpilation step entirely.
 *
 * Observable via `patchCount` (runtimeContext.metrics.length), which increments
 * on every successful transpilation call – including ones that produce identical
 * output.  It therefore distinguishes "transpilation skipped" from "transpilation
 * ran but produced the same patch".
 */

import assert from "node:assert/strict";
import type { WatchListener } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { fetchStatusPayload, waitForStatus } from "./test-helpers/status-polling.js";
import { createMockWatchFactory } from "./test-helpers/watch-fixtures.js";
import { runWatchTest } from "./test-helpers/watch-runner.js";

void describe("watch command source content hash guard", () => {
    void it("skips transpilation when content is unchanged despite mtime advancing", async () => {
        const listenerCapture: { listener: WatchListener<string> | undefined } = { listener: undefined };
        const watchFactory = createMockWatchFactory(listenerCapture);

        await runWatchTest(
            "watch-unchanged-source-content",
            {
                watchFactory,
                debounceDelay: 0
            },
            async (context) => {
                const { testDir, baseUrl } = context;

                // Wait for the initial scan to complete before writing any files.
                await waitForStatus(baseUrl, (status) => status.scanComplete === true, 2000);

                const testFile = path.join(testDir, "content_hash_script.gml");
                const originalContent = `function content_hash_script() {
    return 42;
}`;

                // ── Step 1: first write – triggers a real transpilation ──────────
                await writeFile(testFile, originalContent, "utf8");

                assert.ok(listenerCapture.listener, "watch listener should be captured");
                listenerCapture.listener("change", path.basename(testFile));

                await waitForStatus(baseUrl, (status) => (status.patchCount ?? 0) >= 1, 2000);
                const afterFirstWrite = await fetchStatusPayload(baseUrl);
                const patchCountAfterFirst = afterFirstWrite.patchCount ?? 0;

                assert.ok(patchCountAfterFirst >= 1, "first write should trigger transpilation");

                // ── Step 2: re-write identical content after a short pause ───────
                // The pause ensures the OS assigns a strictly newer mtime so the
                // mtime guard does not suppress the event before the hash check runs.
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 10);
                });
                await writeFile(testFile, originalContent, "utf8");

                listenerCapture.listener("change", path.basename(testFile));

                // Allow time for event processing to complete.
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 200);
                });

                const afterSecondWrite = await fetchStatusPayload(baseUrl);

                assert.equal(
                    afterSecondWrite.patchCount,
                    patchCountAfterFirst,
                    "re-saving identical content should not trigger transpilation"
                );

                // ── Step 3: change content – transpilation resumes ────────────────
                const newContent = `function content_hash_script() {
    return 99;
}`;
                await writeFile(testFile, newContent, "utf8");

                listenerCapture.listener("change", path.basename(testFile));

                await waitForStatus(baseUrl, (status) => (status.patchCount ?? 0) > patchCountAfterFirst, 2000);

                const afterThirdWrite = await fetchStatusPayload(baseUrl);
                assert.ok(
                    (afterThirdWrite.patchCount ?? 0) > patchCountAfterFirst,
                    "changed content should trigger a new transpilation"
                );
            }
        );
    });
});
