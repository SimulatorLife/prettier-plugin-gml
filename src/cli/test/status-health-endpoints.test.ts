import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { runWatchCommand } from "../src/commands/watch.js";
import { findAvailablePort } from "./test-helpers/free-port.js";

void describe("status server health check endpoints", () => {
    void it("should provide /health endpoint with comprehensive health status", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-health-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const abortController = new AbortController();
            const statusPort = await findAvailablePort();

            const watchPromise = runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                verbose: false,
                quiet: true,
                statusPort,
                websocketServer: false,
                runtimeServer: false,
                abortSignal: abortController.signal
            });

            // Give the server time to start
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Query the health endpoint
            const response = await fetch(
                `http://127.0.0.1:${statusPort}/health`
            );

            assert.equal(
                response.status,
                200,
                "Health endpoint should return 200"
            );
            assert.equal(
                response.headers.get("content-type"),
                "application/json",
                "Content type should be application/json"
            );

            const data = await response.json();

            assert.ok("status" in data, "Health should include status field");
            assert.equal(data.status, "healthy", "Status should be 'healthy'");
            assert.ok(
                "timestamp" in data,
                "Health should include timestamp field"
            );
            assert.ok("uptime" in data, "Health should include uptime field");
            assert.ok("checks" in data, "Health should include checks field");
            assert.ok(
                "transpilation" in data.checks,
                "Checks should include transpilation"
            );
            assert.ok(
                "websocket" in data.checks,
                "Checks should include websocket"
            );

            // Verify transpilation check structure
            assert.ok(
                "status" in data.checks.transpilation,
                "Transpilation check should include status"
            );
            assert.equal(
                data.checks.transpilation.status,
                "pass",
                "Initial transpilation status should be 'pass'"
            );
            assert.ok(
                "patchCount" in data.checks.transpilation,
                "Transpilation check should include patchCount"
            );
            assert.ok(
                "errorCount" in data.checks.transpilation,
                "Transpilation check should include errorCount"
            );

            // Verify websocket check structure
            assert.ok(
                "status" in data.checks.websocket,
                "WebSocket check should include status"
            );
            assert.equal(
                data.checks.websocket.status,
                "pass",
                "WebSocket status should be 'pass'"
            );
            assert.ok(
                "clients" in data.checks.websocket,
                "WebSocket check should include clients count"
            );

            abortController.abort();
            await watchPromise;
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should provide /ping endpoint for lightweight connectivity check", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-ping-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const abortController = new AbortController();
            const statusPort = await findAvailablePort();

            const watchPromise = runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                verbose: false,
                quiet: true,
                statusPort,
                websocketServer: false,
                runtimeServer: false,
                abortSignal: abortController.signal
            });

            // Give the server time to start
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Query the ping endpoint
            const response = await fetch(`http://127.0.0.1:${statusPort}/ping`);

            assert.equal(
                response.status,
                200,
                "Ping endpoint should return 200"
            );
            assert.equal(
                response.headers.get("content-type"),
                "application/json",
                "Content type should be application/json"
            );

            const data = await response.json();

            assert.ok("status" in data, "Ping should include status field");
            assert.equal(data.status, "ok", "Ping status should be 'ok'");
            assert.ok(
                "timestamp" in data,
                "Ping should include timestamp field"
            );
            assert.ok(
                typeof data.timestamp === "number",
                "Timestamp should be a number"
            );

            abortController.abort();
            await watchPromise;
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should provide /ready endpoint for readiness probes", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-ready-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const abortController = new AbortController();
            const statusPort = await findAvailablePort();

            const watchPromise = runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                verbose: false,
                quiet: true,
                statusPort,
                websocketServer: false,
                runtimeServer: false,
                abortSignal: abortController.signal
            });

            // Give the server time to start
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Query the ready endpoint
            const response = await fetch(
                `http://127.0.0.1:${statusPort}/ready`
            );

            assert.equal(
                response.status,
                200,
                "Ready endpoint should return 200 when ready"
            );
            assert.equal(
                response.headers.get("content-type"),
                "application/json",
                "Content type should be application/json"
            );

            const data = await response.json();

            assert.ok(
                "ready" in data,
                "Ready response should include ready field"
            );
            assert.equal(
                data.ready,
                true,
                "Server should be ready with no errors"
            );
            assert.ok(
                "timestamp" in data,
                "Ready response should include timestamp"
            );
            assert.ok("uptime" in data, "Ready response should include uptime");

            abortController.abort();
            await watchPromise;
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should return 404 for unsupported endpoints", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-404-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const abortController = new AbortController();
            const statusPort = await findAvailablePort();

            const watchPromise = runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                verbose: false,
                quiet: true,
                statusPort,
                websocketServer: false,
                runtimeServer: false,
                abortSignal: abortController.signal
            });

            // Give the server time to start
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Query an unsupported endpoint
            const response = await fetch(
                `http://127.0.0.1:${statusPort}/unsupported`
            );

            assert.equal(
                response.status,
                404,
                "Unsupported endpoint should return 404"
            );

            const data = await response.json();

            assert.ok(
                "error" in data,
                "404 response should include error field"
            );
            assert.ok(
                "message" in data,
                "404 response should include message field"
            );
            assert.ok(
                data.message.includes("/status"),
                "Message should list /status endpoint"
            );
            assert.ok(
                data.message.includes("/health"),
                "Message should list /health endpoint"
            );
            assert.ok(
                data.message.includes("/ping"),
                "Message should list /ping endpoint"
            );
            assert.ok(
                data.message.includes("/ready"),
                "Message should list /ready endpoint"
            );

            abortController.abort();
            await watchPromise;
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should reject non-GET requests", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-post-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const abortController = new AbortController();
            const statusPort = await findAvailablePort();

            const watchPromise = runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                verbose: false,
                quiet: true,
                statusPort,
                websocketServer: false,
                runtimeServer: false,
                abortSignal: abortController.signal
            });

            // Give the server time to start
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Try POST to /status
            const response = await fetch(
                `http://127.0.0.1:${statusPort}/status`,
                { method: "POST" }
            );

            assert.equal(
                response.status,
                404,
                "POST request should return 404"
            );

            abortController.abort();
            await watchPromise;
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should include CORS headers in all responses", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-cors-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        );

        await mkdir(testDir, { recursive: true });

        try {
            const abortController = new AbortController();
            const statusPort = await findAvailablePort();

            const watchPromise = runWatchCommand(testDir, {
                extensions: [".gml"],
                polling: false,
                verbose: false,
                quiet: true,
                statusPort,
                websocketServer: false,
                runtimeServer: false,
                abortSignal: abortController.signal
            });

            // Give the server time to start
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Check CORS headers on all endpoints
            const endpoints = ["/status", "/health", "/ping", "/ready"];

            for (const endpoint of endpoints) {
                const response = await fetch(
                    `http://127.0.0.1:${statusPort}${endpoint}`
                );

                assert.equal(
                    response.headers.get("access-control-allow-origin"),
                    "*",
                    `${endpoint} should include CORS header`
                );
            }

            abortController.abort();
            await watchPromise;
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });
});
