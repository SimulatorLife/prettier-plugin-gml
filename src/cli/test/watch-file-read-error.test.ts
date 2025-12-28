import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FSWatcher, PathLike, WatchListener, WatchOptions } from "node:fs";

import { runWatchCommand } from "../src/commands/watch.js";

void describe("Watch command file read errors", () => {
    void it("logs read failures even in quiet mode", async () => {
        const root = await mkdtemp(path.join(tmpdir(), "watch-read-error-"));
        const problematicDir = path.join(root, "dir-as-file.gml");
        await mkdir(problematicDir, { recursive: true });

        const abortController = new AbortController();
        const capturedErrors: Array<string> = [];
        const originalError = console.error;
        let resolveErrorLogged: (() => void) | null = null;
        const errorLogged = new Promise<void>((resolve) => {
            resolveErrorLogged = resolve;
        });

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

        console.error = (...args: Array<unknown>): void => {
            capturedErrors.push(args.map(String).join(" "));
            resolveErrorLogged?.();
        };

        try {
            const watchPromise = runWatchCommand(root, {
                extensions: [".gml"],
                quiet: true,
                verbose: false,
                runtimeServer: false,
                websocketServer: false,
                statusServer: false,
                abortSignal: abortController.signal,
                watchFactory
            });

            await new Promise((resolve) => setTimeout(resolve, 50));

            capturedListener?.("change", path.basename(problematicDir));

            await Promise.race([
                errorLogged,
                new Promise((resolve) => setTimeout(resolve, 500))
            ]);

            abortController.abort();
            await watchPromise;
        } finally {
            console.error = originalError;
            await rm(root, { recursive: true, force: true });
        }

        assert.ok(
            capturedErrors.some((line) =>
                line.includes("Error reading dir-as-file.gml")
            ),
            "should log file read errors even when quiet"
        );
    });
});
