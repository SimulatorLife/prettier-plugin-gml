/**
 * Integration test for hot-reload patch streaming.
 *
 * Validates the complete pipeline from file change detection through transpilation
 * to WebSocket patch delivery.
 */

import assert from "node:assert";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { runWatchCommand } from "../src/commands/watch.js";
import { findAvailablePort } from "./test-helpers/free-port.js";
import { waitForScanComplete } from "./test-helpers/status-polling.js";
import { connectToHotReloadWebSocket, type WebSocketPatchStream } from "./test-helpers/websocket-client.js";

void describe("Hot reload integration loop", () => {
    let testDir;
    let testFile;
    let websocketContextPromise: Promise<WebSocketPatchStream> | null = null;

    before(async () => {
        testDir = path.join(process.cwd(), "tmp", `test-watch-${Date.now()}`);
        await mkdir(testDir, { recursive: true });
        testFile = path.join(testDir, "test_script.gml");
        await writeFile(testFile, "// Initial content\nvar x = 10;", "utf8");
    });

    after(async () => {
        const contextPromise = websocketContextPromise;
        websocketContextPromise = null;

        if (contextPromise !== null) {
            try {
                const context = await contextPromise;
                await context.disconnect();
            } catch {
                // Ignore cleanup failures; tests already manage log output
            }
        }

        if (testDir) {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should stream patches via WebSocket when files change", async () => {
        const websocketPort = await findAvailablePort();
        const statusPort = await findAvailablePort();
        const abortController = new AbortController();

        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: false,
            websocketPort,
            websocketHost: "127.0.0.1",
            runtimeServer: false,
            statusServer: true,
            statusPort,
            abortSignal: abortController.signal
        });

        let context: WebSocketPatchStream | null = null;

        try {
            const contextPromise = connectToHotReloadWebSocket(`ws://127.0.0.1:${websocketPort}`, {
                connectionTimeoutMs: 4000,
                retryIntervalMs: 25,
                onParseError: (error) => {
                    console.error("Failed to parse patch:", error);
                }
            });

            websocketContextPromise = contextPromise;
            context = await contextPromise;

            await waitForScanComplete(`http://127.0.0.1:${statusPort}`, 5000, 25);
            await writeFile(testFile, "// Updated content\nvar y = 20;", "utf8");
            await context.waitForPatches({ timeoutMs: 10000 });
        } finally {
            abortController.abort();

            if (context) {
                await context.disconnect();
            }

            try {
                await watchPromise;
            } catch {
                // Expected when aborting
            }
        }

        assert.ok(context, "WebSocket client should be connected");
        assert.ok(
            context.receivedPatches.length > 0,
            `Should receive at least one patch (received ${context.receivedPatches.length})`
        );

        const patch = context.receivedPatches.at(-1);
        assert.strictEqual(patch.kind, "script", "Patch should be a script");
        assert.ok(patch.id, "Patch should have an ID");
        assert.ok(patch.js_body, "Patch should have JavaScript body");
        assert.ok(patch.id.includes("test_script"), "Patch ID should reference the script name");
        assert.strictEqual(
            patch.runtimeId,
            undefined,
            "Script patches should rely on patch IDs for runtime binding resolution"
        );
    });
});
