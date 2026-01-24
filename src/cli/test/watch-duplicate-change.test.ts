import assert from "node:assert/strict";
import type { FSWatcher, PathLike, WatchListener, WatchOptions } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";

import { runWatchTest } from "./test-helpers/watch-runner.js";

interface WatchStatusPayload {
    scanComplete: boolean;
    totalPatchCount: number;
}

async function fetchStatus(baseUrl: string): Promise<WatchStatusPayload> {
    const response = await fetch(`${baseUrl}/status`);
    return (await response.json()) as WatchStatusPayload;
}

async function waitForStatus(
    baseUrl: string,
    predicate: (status: WatchStatusPayload) => boolean,
    timeoutMs: number
): Promise<WatchStatusPayload> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        const status = await fetchStatus(baseUrl);
        if (predicate(status)) {
            return status;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error("Timed out waiting for watch status update");
}

void describe("watch command duplicate change handling", () => {
    void it("skips duplicate change events when file mtime is unchanged", async () => {
        let capturedListener: WatchListener<string> | undefined;

        const watchFactory = (
            _path: PathLike,
            _options?: WatchOptions | BufferEncoding | "buffer",
            listener?: WatchListener<string>
        ): FSWatcher => {
            void _path;
            void _options;
            capturedListener = listener;

            const watcher: FSWatcher = {
                close() {
                    return undefined;
                },
                ref() {
                    return this;
                },
                unref() {
                    return this;
                },
                addListener() {
                    return this;
                },
                on() {
                    return this;
                },
                once() {
                    return this;
                },
                removeListener() {
                    return this;
                },
                off() {
                    return this;
                },
                removeAllListeners() {
                    return this;
                },
                setMaxListeners() {
                    return this;
                },
                getMaxListeners() {
                    return 0;
                },
                listeners() {
                    return [];
                },
                rawListeners() {
                    return [];
                },
                emit() {
                    return false;
                },
                listenerCount() {
                    return 0;
                },
                prependListener() {
                    return this;
                },
                prependOnceListener() {
                    return this;
                },
                eventNames() {
                    return [];
                }
            };

            return watcher;
        };

        await runWatchTest(
            "watch-duplicate-change",
            {
                watchFactory,
                debounceDelay: 0
            },
            async ({ baseUrl, testDir }) => {
                await waitForStatus(baseUrl, (status) => status.scanComplete, 1000);

                const testFile = path.join(testDir, "script1.gml");
                await writeFile(testFile, "var x = 1;", "utf8");

                assert.ok(capturedListener, "watch listener should be registered");

                capturedListener?.("change", path.basename(testFile));
                await waitForStatus(baseUrl, (status) => status.totalPatchCount >= 1, 1000);

                const firstStatus = await fetchStatus(baseUrl);

                capturedListener?.("change", path.basename(testFile));
                await new Promise((resolve) => setTimeout(resolve, 150));

                const secondStatus = await fetchStatus(baseUrl);

                assert.equal(
                    secondStatus.totalPatchCount,
                    firstStatus.totalPatchCount,
                    "duplicate events should not increase patch count"
                );
            }
        );
    });
});
