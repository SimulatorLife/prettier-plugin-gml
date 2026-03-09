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
 *
 * The test uses a sentinel file to create a deterministic wait point: after
 * firing the "same content" event we immediately write a distinct sentinel file
 * and fire its event, then wait for patchCount to reflect the sentinel
 * transpilation.  This avoids hard-coded delays: if the same-content event had
 * triggered a transpilation, patchCount would overshoot the expected value.
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
                const sentinelFile = path.join(testDir, "sentinel_script.gml");
                const originalContent = `function content_hash_script() {
    return 42;
}`;

                assert.ok(listenerCapture.listener, "watch listener should be captured");

                // ── Step 1: first write – triggers a real transpilation ──────────
                await writeFile(testFile, originalContent, "utf8");
                listenerCapture.listener("change", path.basename(testFile));

                await waitForStatus(baseUrl, (status) => (status.patchCount ?? 0) >= 1, 2000);
                const afterFirstWrite = await fetchStatusPayload(baseUrl);
                const patchCountAfterFirst = afterFirstWrite.patchCount ?? 0;

                assert.ok(patchCountAfterFirst >= 1, "first write should trigger transpilation");

                // ── Step 2: re-write identical content – content hash should suppress it ─
                // A short pause (20ms) ensures the OS assigns a strictly newer mtime
                // so the cheaper mtime guard does not suppress the event before the
                // hash check gets a chance to run.
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 20);
                });
                await writeFile(testFile, originalContent, "utf8");
                listenerCapture.listener("change", path.basename(testFile));

                // ── Step 3: sentinel write – provides a deterministic wait point ──
                // The sentinel file has different content so it always triggers
                // transpilation.  We wait for patchCount to reflect exactly the
                // sentinel transpilation; if the same-content event had also
                // triggered transpilation, patchCount would overshoot the target.
                const sentinelContent = `function sentinel_script() {
    return 0;
}`;
                await writeFile(sentinelFile, sentinelContent, "utf8");
                listenerCapture.listener("change", path.basename(sentinelFile));

                // Wait until the sentinel transpilation has been recorded.
                const expectedPatchCount = patchCountAfterFirst + 1;
                await waitForStatus(baseUrl, (status) => (status.patchCount ?? 0) >= expectedPatchCount, 2000);

                const afterSentinel = await fetchStatusPayload(baseUrl);

                assert.equal(
                    afterSentinel.patchCount,
                    expectedPatchCount,
                    "re-saving identical content should not trigger transpilation (only sentinel should)"
                );

                // ── Step 4: changed content resumes transpilation ─────────────────
                const newContent = `function content_hash_script() {
    return 99;
}`;
                await writeFile(testFile, newContent, "utf8");
                listenerCapture.listener("change", path.basename(testFile));

                await waitForStatus(baseUrl, (status) => (status.patchCount ?? 0) > expectedPatchCount, 2000);

                const afterChange = await fetchStatusPayload(baseUrl);
                assert.ok(
                    (afterChange.patchCount ?? 0) > expectedPatchCount,
                    "changed content should trigger a new transpilation"
                );

                // ── Step 5: content-length-changing edit still refreshes hash for no-op saves ─
                const largerContent = `function content_hash_script() {
    return 1000;
}`;
                await writeFile(testFile, largerContent, "utf8");
                listenerCapture.listener("change", path.basename(testFile));

                const patchCountAfterLargerWriteTarget = (afterChange.patchCount ?? 0) + 1;
                await waitForStatus(
                    baseUrl,
                    (status) => (status.patchCount ?? 0) >= patchCountAfterLargerWriteTarget,
                    2000
                );

                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 20);
                });
                await writeFile(testFile, largerContent, "utf8");
                listenerCapture.listener("change", path.basename(testFile));

                await writeFile(sentinelFile, sentinelContent, "utf8");
                listenerCapture.listener("change", path.basename(sentinelFile));

                const expectedPatchCountAfterNoOpLargeSave = patchCountAfterLargerWriteTarget + 1;
                await waitForStatus(
                    baseUrl,
                    (status) => (status.patchCount ?? 0) >= expectedPatchCountAfterNoOpLargeSave,
                    2000
                );

                const afterNoOpLargeSave = await fetchStatusPayload(baseUrl);
                assert.equal(
                    afterNoOpLargeSave.patchCount,
                    expectedPatchCountAfterNoOpLargeSave,
                    "no-op save after content length change should still be skipped"
                );
            }
        );
    });
});
