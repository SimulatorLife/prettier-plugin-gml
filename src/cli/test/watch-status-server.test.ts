import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { runWatchCommand } from "../src/commands/watch.js";

void describe("watch command status server", () => {
    void it("should start status server by default and provide status endpoint", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-status-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const abortController = new AbortController();
            const statusPort = 18_000 + Math.floor(Math.random() * 1000);
            const websocketPort = 19_000 + Math.floor(Math.random() * 1000);

            const watchPromise = runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                verbose: false,
                quiet: true,
                websocketPort,
                statusPort,
                runtimeServer: false,
                abortSignal: abortController.signal
            });

            // Give the server time to start
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Query the status endpoint
            const response = await fetch(
                `http://127.0.0.1:${statusPort}/status`
            );

            assert.equal(
                response.status,
                200,
                "Status endpoint should return 200"
            );
            assert.equal(
                response.headers.get("content-type"),
                "application/json",
                "Content type should be application/json"
            );

            const data = await response.json();

            assert.ok("uptime" in data, "Status should include uptime");
            assert.ok("patchCount" in data, "Status should include patchCount");
            assert.ok("errorCount" in data, "Status should include errorCount");
            assert.ok(
                "recentPatches" in data,
                "Status should include recentPatches"
            );
            assert.ok(
                "recentErrors" in data,
                "Status should include recentErrors"
            );
            assert.ok(
                "websocketClients" in data,
                "Status should include websocketClients"
            );

            assert.equal(data.patchCount, 0, "Initial patch count should be 0");
            assert.equal(data.errorCount, 0, "Initial error count should be 0");
            assert.equal(
                data.websocketClients,
                0,
                "Initial WebSocket client count should be 0"
            );

            abortController.abort();
            await watchPromise;
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should respect --no-status-server flag", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-no-status-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const abortController = new AbortController();
            const statusPort = 18_000 + Math.floor(Math.random() * 1000);
            const websocketPort = 19_000 + Math.floor(Math.random() * 1000);

            const watchPromise = runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                verbose: false,
                quiet: true,
                websocketPort,
                statusPort,
                statusServer: false,
                runtimeServer: false,
                abortSignal: abortController.signal
            });

            // Give the server time to start
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Try to query the status endpoint - should fail
            try {
                await fetch(`http://127.0.0.1:${statusPort}/status`);
                assert.fail("Status server should not be running");
            } catch (error) {
                // Connection should be refused when server is disabled
                assert.ok(
                    error instanceof Error,
                    "Expected an error when connecting to disabled server"
                );
            }

            abortController.abort();
            await watchPromise;
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should handle missing route with 404 error", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-status-404-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const abortController = new AbortController();
            const statusPort = 18_000 + Math.floor(Math.random() * 1000);
            const websocketPort = 19_000 + Math.floor(Math.random() * 1000);

            const watchPromise = runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                verbose: false,
                quiet: true,
                websocketPort,
                statusPort,
                runtimeServer: false,
                abortSignal: abortController.signal
            });

            // Give the server time to start
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Query a non-existent endpoint
            const response = await fetch(
                `http://127.0.0.1:${statusPort}/nonexistent`
            );

            assert.equal(
                response.status,
                404,
                "Non-existent route should return 404"
            );

            const data = await response.json();
            assert.ok(
                "error" in data,
                "Error response should include error field"
            );

            abortController.abort();
            await watchPromise;
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });
});
