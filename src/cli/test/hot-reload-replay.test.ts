/**
 * Ensures late WebSocket subscribers receive the latest patch backlog.
 *
 * This test writes a GML file to trigger transpilation before any WebSocket
 * client is connected, then connects a client and expects the cached patch to
 * be replayed immediately.
 */

import assert from "node:assert";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { runWatchCommand } from "../src/commands/watch.js";
import { findAvailablePort } from "./test-helpers/free-port.js";
import { waitForPatchCount } from "./test-helpers/status-polling.js";
import { connectToHotReloadWebSocket, type WebSocketPatchStream } from "./test-helpers/websocket-client.js";

void describe("Hot reload replay for late subscribers", () => {
    let testDir: string;
    let testFile: string;
    let websocketClient: WebSocketPatchStream | null = null;

    before(async () => {
        testDir = path.join(process.cwd(), "tmp", `hot-reload-replay-${Date.now()}`);
        await mkdir(testDir, { recursive: true });
        testFile = path.join(testDir, "late_join_patch.gml");
    });

    after(async () => {
        if (websocketClient) {
            await websocketClient.disconnect();
        }
        await rm(testDir, { recursive: true, force: true });
    });

    void it("replays the latest patch to new WebSocket clients", async () => {
        const abortController = new AbortController();
        const websocketPort = await findAvailablePort();
        const statusPort = await findAvailablePort();

        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: false,
            websocketPort,
            websocketHost: "127.0.0.1",
            statusPort,
            runtimeServer: false,
            statusServer: true,
            abortSignal: abortController.signal
        });

        let receivedPatches: Array<unknown> = [];

        try {
            await writeFile(testFile, "// first version\nvar late_join_value = 1;", "utf8");

            await waitForPatchCount(`http://127.0.0.1:${statusPort}`, 1, 1500, 25);

            websocketClient = await connectToHotReloadWebSocket(`ws://127.0.0.1:${websocketPort}`, {
                connectionTimeoutMs: 1200,
                retryIntervalMs: 25
            });

            receivedPatches = await websocketClient.waitForPatches({ timeoutMs: 1500 });
        } finally {
            abortController.abort();

            if (websocketClient) {
                await websocketClient.disconnect();
            }

            try {
                await watchPromise;
            } catch {
                // Expected when aborting
            }
        }

        const latestPatch = receivedPatches.at(-1);

        assert.ok(latestPatch && typeof latestPatch === "object", "Should receive a replayed patch object");
        assert.ok(
            (latestPatch as { id?: string }).id?.includes("late_join_patch"),
            "Patch ID should include the script name"
        );
        assert.equal((latestPatch as { kind?: string }).kind, "script", "Patch kind should be script");
    });
});
