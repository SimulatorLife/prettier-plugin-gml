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
import WebSocket from "ws";

import { runWatchCommand } from "../src/commands/watch.js";
import { findAvailablePort } from "./test-helpers/free-port.js";

void describe("Hot reload integration loop", () => {
    let testDir;
    let testFile;
    let websocketClient;
    let receivedPatches;

    before(async () => {
        testDir = path.join(process.cwd(), "tmp", `test-watch-${Date.now()}`);
        await mkdir(testDir, { recursive: true });
        testFile = path.join(testDir, "test_script.gml");
        await writeFile(testFile, "// Initial content\nvar x = 10;", "utf8");
        receivedPatches = [];
    });

    after(async () => {
        if (websocketClient) {
            // Ensure the client is closed and we wait for the 'close' event. Closing
            // the client is asynchronous and leaving it open can keep the Node event
            // loop alive and cause the test runner to report a pending promise.
            await new Promise<void>((resolve) => {
                try {
                    websocketClient.once("close", () => resolve());
                    websocketClient.close();
                } catch {
                    // If the socket is already closed or an error occurs, resolve
                    // immediately so the cleanup continues.
                    resolve();
                }
            });
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

        await new Promise<void>((resolve, reject) => {
            websocketClient = new WebSocket(`ws://127.0.0.1:${websocketPort}`);

            websocketClient.on("open", () => {
                resolve();
            });

            websocketClient.on("error", (error) => {
                reject(
                    error instanceof Error
                        ? error
                        : new Error(
                              `WebSocket error: ${
                                  error === undefined
                                      ? "unknown"
                                      : String(error)
                              }`
                          )
                );
            });

            websocketClient.on("message", (data) => {
                try {
                    const patch = JSON.parse(data.toString());
                    receivedPatches.push(patch);
                } catch (error) {
                    console.error("Failed to parse patch:", error);
                }
            });
        });

        await writeFile(testFile, "// Updated content\nvar y = 20;", "utf8");

        await new Promise((resolve) => setTimeout(resolve, 2000));

        abortController.abort();

        try {
            await watchPromise;
        } catch {
            // Expected when aborting
        }

        assert.ok(
            receivedPatches.length > 0,
            `Should receive at least one patch (received ${receivedPatches.length})`
        );

        const patch = receivedPatches.at(-1);
        assert.strictEqual(patch.kind, "script", "Patch should be a script");
        assert.ok(patch.id, "Patch should have an ID");
        assert.ok(patch.js_body, "Patch should have JavaScript body");
        assert.ok(
            patch.id.includes("test_script"),
            "Patch ID should reference the script name"
        );
    });
});
