import assert from "node:assert/strict";
import type { WatchListener } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { runWatchCommand } from "../src/commands/watch.js";
import { withTemporaryProperty } from "./test-helpers/temporary-property.js";
import { createMockWatchFactory } from "./test-helpers/watch-fixtures.js";

void describe("Watch command file read errors", () => {
    void it("logs read failures even in quiet mode", async () => {
        const root = await mkdtemp(path.join(tmpdir(), "watch-read-error-"));
        const problematicDir = path.join(root, "dir-as-file.gml");
        await mkdir(problematicDir, { recursive: true });

        const abortController = new AbortController();
        const capturedErrors: Array<string> = [];
        let resolveErrorLogged: (() => void) | null = null;
        const errorLogged = new Promise<void>((resolve) => {
            resolveErrorLogged = resolve;
        });

        const listenerCapture: { listener: WatchListener<string> | undefined } = { listener: undefined };
        const watchFactory = createMockWatchFactory(listenerCapture);

        await withTemporaryProperty(
            console,
            "error",
            (...args: Array<unknown>): void => {
                capturedErrors.push(args.map(String).join(" "));
                resolveErrorLogged?.();
            },
            async () => {
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

                listenerCapture.listener?.("change", path.basename(problematicDir));

                await Promise.race([errorLogged, new Promise((resolve) => setTimeout(resolve, 500))]);

                abortController.abort();
                await watchPromise;
            }
        );

        await rm(root, { recursive: true, force: true });

        assert.ok(
            capturedErrors.some((line) => line.includes("Error reading dir-as-file.gml")),
            "should log file read errors even when quiet"
        );
    });
});
