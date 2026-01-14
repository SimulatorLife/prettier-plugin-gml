/**
 * Integration test for hot-reload patch streaming.
 *
 * Validates the complete pipeline from file change detection through transpilation
 * to WebSocket patch delivery.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { runWatchCommand } from "../src/commands/watch.js";
import { findAvailablePort } from "./test-helpers/free-port.js";
import { connectToHotReloadWebSocket, type WebSocketPatchStream } from "./test-helpers/websocket-client.js";

void describe("Hot reload integration loop", () => {
    let testDir;
    let testFile;
    let websocketContext: WebSocketPatchStream | null = null;

    before(async () => {
        testDir = path.join(process.cwd(), "tmp", `test-watch-${Date.now()}`);
        await mkdir(testDir, { recursive: true });
        testFile = path.join(testDir, "test_script.gml");
        await writeFile(testFile, "// Initial content\nvar x = 10;", "utf8");
    });

    after(async () => {
        if (websocketContext) {
            await websocketContext.disconnect();
            websocketContext = null;
        }
        if (testDir) {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should stream patches via WebSocket when files change", async () => {
        const websocketPort = await findAvailablePort();
        const abortController = new AbortController();

        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: false,
            websocketPort,
            websocketHost: "127.0.0.1",
            runtimeServer: false,
            statusServer: false,
            abortSignal: abortController.signal
        });

        await new Promise((resolve) => setTimeout(resolve, 1000));

        websocketContext = await connectToHotReloadWebSocket(`ws://127.0.0.1:${websocketPort}`, {
            onParseError: (error) => {
                console.error("Failed to parse patch:", error);
            }
        });

        await writeFile(testFile, "// Updated content\nvar y = 20;", "utf8");

        await new Promise((resolve) => setTimeout(resolve, 2000));

        abortController.abort();

        try {
            await watchPromise;
        } catch {
            // Expected when aborting
        }

        const context = websocketContext;
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
    });
});
