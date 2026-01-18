import assert from "node:assert/strict";
import type { FSWatcher, PathLike, WatchListener, WatchOptions } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runWatchCommand } from "../src/commands/watch.js";
import { DependencyTracker } from "../src/modules/dependency-tracker.js";
import { withTemporaryProperty } from "./test-helpers/temporary-property.js";

void describe("Watch command file removal", () => {
    void it("removes dependency tracking when a watched file is deleted", async () => {
        const root = await mkdtemp(path.join(tmpdir(), "watch-file-removal-"));
        const targetFile = path.join(root, "script1.gml");
        await writeFile(targetFile, "var x = 1;", "utf8");

        const abortController = new AbortController();
        let capturedListener: WatchListener<string> | undefined;
        const removeFileDescriptor = Object.getOwnPropertyDescriptor(DependencyTracker.prototype, "removeFile");
        if (!removeFileDescriptor || typeof removeFileDescriptor.value !== "function") {
            throw new Error("Expected DependencyTracker.removeFile to be defined");
        }
        const callOriginalRemoveFile = Function.prototype.call.bind(removeFileDescriptor.value) as (
            tracker: DependencyTracker,
            filePath: string
        ) => void;
        let removedFilePath: string | null = null;
        let resolveRemoval: (() => void) | null = null;
        const removalPromise = new Promise<void>((resolve) => {
            resolveRemoval = resolve;
        });

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

        await withTemporaryProperty(
            DependencyTracker.prototype,
            "removeFile",
            function (this: DependencyTracker, filePath: string): void {
                removedFilePath = filePath;
                resolveRemoval?.();
                return callOriginalRemoveFile(this, filePath);
            },
            async () => {
                const watchPromise = runWatchCommand(root, {
                    extensions: [".gml"],
                    verbose: false,
                    quiet: true,
                    debounceDelay: 0,
                    runtimeServer: false,
                    websocketServer: false,
                    statusServer: false,
                    abortSignal: abortController.signal,
                    watchFactory
                });

                await new Promise((resolve) => setTimeout(resolve, 50));

                await rm(targetFile, { force: true });
                capturedListener?.("rename", path.basename(targetFile));

                await Promise.race([removalPromise, new Promise((resolve) => setTimeout(resolve, 500))]);

                abortController.abort();
                await watchPromise;
            }
        );

        await rm(root, { recursive: true, force: true });

        assert.equal(removedFilePath, targetFile, "dependency tracking should be cleared for removed file");
    });
});
