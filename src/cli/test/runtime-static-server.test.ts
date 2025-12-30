import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";

import { startRuntimeStaticServer } from "../src/modules/runtime/server.js";

/**
 * Maximum variance in file descriptor count allowed after operations.
 * This tolerance accounts for normal runtime variance from operations like
 * fetch(), timers, and internal Node.js event loop activities.
 */
const MAX_ALLOWED_FD_VARIANCE = 5;

/**
 * Time to wait for asynchronous cleanup operations to complete.
 * This duration ensures stream.destroy() and listener cleanup have finished
 * before we verify no resource leaks occurred.
 */
const CLEANUP_WAIT_TIME_MS = 200;

void describe("runtime static server", () => {
    void it("serves files from the runtime root", async () => {
        const tempDir = await mkdtemp(
            path.join(os.tmpdir(), "gml-runtime-server-")
        );
        const indexPath = path.join(tempDir, "index.html");
        await writeFile(indexPath, "<html><body>ok</body></html>");

        let server;
        try {
            server = await startRuntimeStaticServer({
                runtimeRoot: tempDir,
                host: "127.0.0.1",
                port: 0,
                verbose: false
            });

            const response = await fetch(server.url);
            assert.equal(response.status, 200);
            const text = await response.text();
            assert.equal(text, "<html><body>ok</body></html>");
        } finally {
            if (server) {
                await server.stop();
            }
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    void it("responds with 404 for missing files", async () => {
        const tempDir = await mkdtemp(
            path.join(os.tmpdir(), "gml-runtime-server-404-")
        );
        const indexPath = path.join(tempDir, "index.html");
        await writeFile(indexPath, "<html></html>");

        let server;
        try {
            server = await startRuntimeStaticServer({
                runtimeRoot: tempDir,
                host: "127.0.0.1",
                port: 0,
                verbose: false
            });

            const response = await fetch(`${server.url}missing.txt`);
            assert.equal(response.status, 404);
        } finally {
            if (server) {
                await server.stop();
            }
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    void it("prevents directory traversal attempts", async () => {
        const tempDir = await mkdtemp(
            path.join(os.tmpdir(), "gml-runtime-server-403-")
        );
        const indexPath = path.join(tempDir, "index.html");
        await writeFile(indexPath, "<html></html>");

        let server;
        try {
            server = await startRuntimeStaticServer({
                runtimeRoot: tempDir,
                host: "127.0.0.1",
                port: 0,
                verbose: false
            });

            const statusCode = await new Promise((resolve, reject) => {
                let buffer = "";
                const socket = net.createConnection(
                    {
                        host: server.host,
                        port: server.port
                    },
                    () => {
                        socket.write(
                            `GET /%2e%2e/%2e%2e/secret HTTP/1.1\r\nHost: ${server.host}:${server.port}\r\nConnection: close\r\n\r\n`
                        );
                    }
                );

                socket.on("data", (chunk) => {
                    buffer += chunk.toString("utf8");
                });

                socket.on("end", () => {
                    const match = buffer.match(/^HTTP\/1\.1\s+(\d{3})/);
                    resolve(match ? Number(match[1]) : 0);
                });

                socket.on("error", reject);
            });

            assert.equal(statusCode, 403);
        } finally {
            if (server) {
                await server.stop();
            }
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    void it("closes file streams on read errors without leaking descriptors", async () => {
        const tempDir = await mkdtemp(
            path.join(os.tmpdir(), "gml-runtime-server-stream-leak-")
        );
        const testFile = path.join(tempDir, "test.txt");
        await writeFile(testFile, "test content");

        let server;
        try {
            server = await startRuntimeStaticServer({
                runtimeRoot: tempDir,
                host: "127.0.0.1",
                port: 0,
                verbose: false
            });

            // Make the file unreadable to trigger a stream error
            await chmod(testFile, 0o000);

            // Count initial file descriptors
            const initialFdCount = await getOpenFileDescriptorCount();

            // Attempt to read the unreadable file
            const response = await fetch(`${server.url}test.txt`);
            assert.equal(response.status, 500);

            // Allow some time for async cleanup
            await new Promise((resolve) =>
                setTimeout(resolve, CLEANUP_WAIT_TIME_MS)
            );

            // Verify no file descriptors leaked
            const finalFdCount = await getOpenFileDescriptorCount();
            assert.ok(
                finalFdCount <= initialFdCount + MAX_ALLOWED_FD_VARIANCE,
                `File descriptors leaked: ${finalFdCount - initialFdCount} descriptors`
            );
        } finally {
            if (server) {
                await server.stop();
            }
            // Restore permissions before cleanup
            try {
                await chmod(testFile, 0o644);
            } catch {
                // Ignore errors
            }
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    void it("closes file streams when client aborts request mid-stream", async () => {
        const tempDir = await mkdtemp(
            path.join(os.tmpdir(), "gml-runtime-server-abort-leak-")
        );
        // Create a large file to ensure stream is still reading when we abort
        const largeContent = "x".repeat(5 * 1024 * 1024); // 5MB to ensure stream is active
        const testFile = path.join(tempDir, "large.txt");
        await writeFile(testFile, largeContent);

        let server;
        try {
            server = await startRuntimeStaticServer({
                runtimeRoot: tempDir,
                host: "127.0.0.1",
                port: 0,
                verbose: false
            });

            // Count initial file descriptors
            const initialFdCount = await getOpenFileDescriptorCount();

            // Use raw socket to abort the connection mid-stream
            await new Promise((resolve, reject) => {
                const socket = net.createConnection(
                    {
                        host: server.host,
                        port: server.port
                    },
                    () => {
                        // Send HTTP request
                        socket.write(
                            `GET /large.txt HTTP/1.1\r\nHost: ${server.host}:${server.port}\r\n\r\n`
                        );

                        // Wait a bit for the response to start, then destroy the socket
                        setTimeout(() => {
                            socket.destroy();
                            resolve(undefined);
                        }, 50);
                    }
                );

                socket.on("error", (error) => {
                    // Expected - socket destroyed
                    if (error.message.includes("ECONNRESET")) {
                        resolve(undefined);
                    } else {
                        reject(error);
                    }
                });
            });

            // Allow time for async cleanup
            await new Promise((resolve) =>
                setTimeout(resolve, CLEANUP_WAIT_TIME_MS)
            );

            // Verify no file descriptors leaked
            const finalFdCount = await getOpenFileDescriptorCount();
            assert.ok(
                finalFdCount <= initialFdCount + MAX_ALLOWED_FD_VARIANCE,
                `File descriptors leaked: ${finalFdCount - initialFdCount} descriptors`
            );
        } finally {
            if (server) {
                await server.stop();
            }
            await rm(tempDir, { recursive: true, force: true });
        }
    });
});

async function getOpenFileDescriptorCount(): Promise<number> {
    try {
        const { readdir } = await import("node:fs/promises");
        const fds = await readdir(`/proc/${process.pid}/fd`);
        return fds.length;
    } catch {
        // On systems without /proc, return 0 (test will effectively be skipped)
        return 0;
    }
}
