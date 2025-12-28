import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FSWatcher, PathLike, WatchListener, WatchOptions } from "node:fs";

import { runWatchCommand } from "../src/commands/watch.js";

void describe("Watch command watcher error handling", () => {
    void it("cleans up gracefully when watcher creation fails", async () => {
        const root = await mkdtemp(path.join(tmpdir(), "watch-watcher-error-"));
        const abortController = new AbortController();
        let factoryInvoked = false;

        const watchFactory = (
            _path: PathLike,
            _options?: WatchOptions | BufferEncoding | "buffer",
            _listener?: WatchListener<string>
        ): FSWatcher => {
            void _path;
            void _options;
            void _listener;
            factoryInvoked = true;
            throw new Error("synthetic watch failure");
        };

        await runWatchCommand(root, {
            extensions: [".gml"],
            polling: false,
            verbose: false,
            websocketServer: false,
            statusServer: false,
            runtimeServer: false,
            abortSignal: abortController.signal,
            watchFactory
        });

        await rm(root, { recursive: true, force: true });

        assert.equal(factoryInvoked, true, "Watch factory should be invoked");
    });
});
