/**
 * Tests for the abort-safe file-read retry helpers in `file-read-retry.ts`.
 *
 * The central resource-leak these tests guard against is:
 *
 *   A `setTimeout` created inside `delayFileReadRetry` with no abort path kept
 *   the Node.js event loop alive after the owning watch-command was stopped.  In
 *   test mode, where `process.exit()` is intentionally not called, those dangling
 *   timers prevented the event loop from draining and left the test runner hanging
 *   until each timer fired (up to 4 × 25 ms = 100 ms for a single retry loop).
 *
 * The fix adds an `AbortSignal` parameter to both helpers so the timer is cleared
 * the moment the signal fires, allowing the event loop to settle immediately.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { delayFileReadRetry, readSourceFileWithTransientEmptyRetry } from "../src/commands/file-read-retry.js";

void describe("delayFileReadRetry — timer resource management", () => {
    void it("resolves after the specified delay when no signal is provided", async () => {
        const start = Date.now();
        await delayFileReadRetry(15);
        const elapsed = Date.now() - start;
        assert.ok(elapsed >= 5, `Expected ≥ 5 ms elapsed, got ${elapsed} ms`);
    });

    void it("rejects immediately when the signal is already aborted before the call", async () => {
        const controller = new AbortController();
        controller.abort();

        await assert.rejects(() => delayFileReadRetry(1000, controller.signal), {
            name: "AbortError"
        });
    });

    /**
     * This test directly demonstrates the resource leak that existed BEFORE the fix.
     *
     * Without abort support, a 400 ms `setTimeout` inside `delayFileReadRetry`
     * would not be cancelled when the signal fired. The promise would only settle
     * after the full 400 ms had elapsed, delaying any code awaiting cleanup. In
     * a test harness that avoids `process.exit()`, the dangling timer would keep
     * the event loop alive for the entire remaining duration.
     *
     * With the fix, aborting the signal at ~20 ms clears the timer immediately
     * and rejects the promise, so the total elapsed time is well under 100 ms.
     */
    void it("clears the timer and rejects immediately when the signal fires mid-delay", async () => {
        const controller = new AbortController();

        const start = Date.now();
        const delayPromise = delayFileReadRetry(400, controller.signal);

        // Abort well before the 400 ms delay would fire
        const abortTimer = setTimeout(() => {
            controller.abort();
        }, 20);

        await assert.rejects(() => delayPromise, { name: "AbortError" });

        clearTimeout(abortTimer);

        const elapsed = Date.now() - start;
        // Should complete close to 20 ms (abort time), not 400 ms.
        // The generous threshold of 200 ms keeps the test robust on slow CI.
        assert.ok(elapsed < 200, `Expected < 200 ms after abort, got ${elapsed} ms (without fix: ~400 ms)`);
    });

    void it("does not suppress the abort reason when a custom reason is provided", async () => {
        const controller = new AbortController();
        const customReason = new Error("custom abort reason");
        controller.abort(customReason);

        const rejection = await delayFileReadRetry(1000, controller.signal).then(
            () => null,
            (error: unknown) => error
        );

        assert.strictEqual(rejection, customReason, "Should reject with the exact abort reason supplied by the caller");
    });
});

void describe("readSourceFileWithTransientEmptyRetry — abort propagation", () => {
    void it("reads file content successfully on the first attempt", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "retry-test-"));
        const filePath = path.join(dir, "script.gml");
        await writeFile(filePath, "var x = 1;", "utf8");

        try {
            const content = await readSourceFileWithTransientEmptyRetry(filePath);
            assert.equal(content, "var x = 1;");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    /**
     * Demonstrates that `readSourceFileWithTransientEmptyRetry` propagates an
     * abort through the retry loop without leaking timer resources.
     *
     * Before the fix:
     *   - An empty file would cause up to 4 retry attempts, each delayed by 25 ms.
     *   - Aborting during the first retry delay left the `setTimeout` alive; the
     *     loop continued retrying until all 4 attempts were exhausted (~100 ms).
     *
     * After the fix:
     *   - The abort signal is forwarded to `delayFileReadRetry`, which clears the
     *     timer and rejects as soon as the signal fires.
     *   - The rejection propagates out of the retry loop immediately.
     */
    void it("aborts the retry loop when the signal fires, preventing timer leaks", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "retry-abort-test-"));
        const filePath = path.join(dir, "empty.gml");

        // An empty file triggers the retry logic (content.length === 0 on first read).
        await writeFile(filePath, "", "utf8");

        const controller = new AbortController();

        const start = Date.now();

        // Begin the retry read and abort immediately. Without the fix the loop
        // would run for up to 4 × 25 ms = 100 ms before returning the empty string.
        const readPromise = readSourceFileWithTransientEmptyRetry(filePath, controller.signal);
        controller.abort();

        await assert.rejects(() => readPromise, { name: "AbortError" });

        const elapsed = Date.now() - start;

        // The abort should cancel the pending delay immediately. Allow a generous
        // 150 ms window to tolerate slow CI; without the fix this would be ≥ 25 ms
        // for the first timer and potentially up to 100 ms for a full retry cycle.
        assert.ok(
            elapsed < 150,
            `Retry loop should be cancelled within 150 ms of abort, took ${elapsed} ms (without fix: up to 100 ms)`
        );

        await rm(dir, { recursive: true, force: true });
    });

    void it("returns empty string on the final attempt when signal is not provided and file stays empty", async () => {
        const dir = await mkdtemp(path.join(tmpdir(), "retry-empty-test-"));
        const filePath = path.join(dir, "empty.gml");
        await writeFile(filePath, "", "utf8");

        try {
            // Without a signal the helper retries TRANSIENT_EMPTY_FILE_READ_RETRY_COUNT
            // times then returns the empty string rather than throwing.
            const content = await readSourceFileWithTransientEmptyRetry(filePath);
            assert.equal(content, "", "Should return empty string after exhausting retries");
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});
