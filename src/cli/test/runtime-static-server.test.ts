import assert from "node:assert/strict";
import { chmod, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { startRuntimeStaticServer } from "../src/modules/runtime/server.js";
import { createHttpSocketAndWaitForResponse } from "./test-helpers/http-socket-utils.js";

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
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "gml-runtime-server-"));
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
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "gml-runtime-server-404-"));
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
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "gml-runtime-server-403-"));
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

    void it("closes keep-alive sockets when stopping the server", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "gml-runtime-server-stop-"));
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

            const { socket, closePromise, responsePromise } = await createHttpSocketAndWaitForResponse(
                server.host,
                server.port,
                `GET /index.html HTTP/1.1\r\nHost: ${server.host}:${server.port}\r\nConnection: keep-alive\r\n\r\n`
            );

            await responsePromise;
            await server.stop();

            const closed = await Promise.race([closePromise.then(() => true), delay(500).then(() => false)]);

            if (!socket.destroyed) {
                socket.destroy();
            }

            assert.equal(closed, true, "Expected runtime server stop to close active sockets");
        } finally {
            if (server) {
                await server.stop();
            }
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    void it("closes file streams on read errors without leaking descriptors", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "gml-runtime-server-stream-leak-"));
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
            await new Promise((resolve) => setTimeout(resolve, CLEANUP_WAIT_TIME_MS));

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
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "gml-runtime-server-abort-leak-"));
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
                        socket.write(`GET /large.txt HTTP/1.1\r\nHost: ${server.host}:${server.port}\r\n\r\n`);

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
            await new Promise((resolve) => setTimeout(resolve, CLEANUP_WAIT_TIME_MS));

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

    void it("destroys the response socket when a stream read error occurs after headers have been sent", async () => {
        // Reproducer for: when a file read stream errors mid-transfer (after HTTP
        // response headers have already been written to the client), the .catch()
        // handler must NOT call res.setHeader() — that throws ERR_HTTP_HEADERS_SENT
        // and leaves the socket open. Instead it must call res.destroy() so the
        // underlying TCP socket is released immediately.
        //
        // The mock stream uses two nested process.nextTick calls to guarantee that
        // the data push and the error fire outside the Readable._read() synchronous
        // context (state.sync = true), which is the only way to ensure the stream
        // emits 'data' synchronously so res.write() — and therefore
        // res.headersSent = true — is set before the error event fires.
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "gml-runtime-server-midstream-"));
        const testFile = path.join(tempDir, "test.txt");
        await writeFile(testFile, "placeholder");

        let server: Awaited<ReturnType<typeof startRuntimeStaticServer>> | null = null;
        try {
            let mockStreamCreated = false;

            // Inject a stream factory that emits some bytes to force headers out,
            // then destroys itself with an error — simulating a mid-stream disk
            // read failure (e.g., hardware error, file unlinked between stat and
            // read, or transient I/O error).
            server = await startRuntimeStaticServer({
                runtimeRoot: tempDir,
                host: "127.0.0.1",
                port: 0,
                createStream: (_filePath) => {
                    mockStreamCreated = true;
                    // Push data and error outside of _read() so state.sync = false
                    // when push() is called. In flowing mode, Readable emits 'data'
                    // synchronously only when state.sync = false; pushing from within
                    // _read() (state.sync = true) defers 'data' emission to a later
                    // tick, which can race with the scheduled destroy.
                    const stream = new Readable({ read() {} });
                    process.nextTick(() => {
                        stream.push(Buffer.alloc(64, 0x78));
                        process.nextTick(() => {
                            stream.destroy(new Error("Simulated mid-stream disk error"));
                        });
                    });
                    return stream;
                }
            });

            // Use Connection: close so a complete response (from writeError) also
            // closes the socket. This way the observable difference between the
            // buggy path and the fixed path is clear:
            //   - Fixed  (headersSent=true):  res.destroy() → socket closes promptly.
            //   - Buggy  (headersSent=true):  writeError throws ERR_HTTP_HEADERS_SENT,
            //                                 res.end() is never called → socket hangs.
            let socketClosed = false;
            let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

            await new Promise<void>((resolve) => {
                const socket = net.createConnection({ host: server!.host, port: server!.port }, () => {
                    socket.write(
                        `GET /test.txt HTTP/1.1\r\nHost: ${server!.host}:${server!.port}\r\nConnection: close\r\n\r\n`
                    );
                });

                // Put the socket in flowing mode so Node.js actively reads data
                // from the kernel receive buffer. Without this, the socket stays
                // paused: unread bytes cause the OS to delay delivering the RST
                // (from res.socket.destroy()) until the buffer is drained, which
                // prevents the "error"/"close" events from firing promptly.
                socket.resume();

                const onSocketEnded = () => {
                    socketClosed = true;
                    if (timeoutHandle !== null) {
                        clearTimeout(timeoutHandle);
                        timeoutHandle = null;
                    }
                    resolve();
                };

                socket.once("close", onSocketEnded);
                // ECONNRESET is equally valid — the server forcefully closed the conn
                socket.once("error", onSocketEnded);

                // Safety timeout: if the socket does NOT close within 2 s the fix
                // is missing and the connection leaked.
                timeoutHandle = setTimeout(() => {
                    timeoutHandle = null;
                    socket.destroy();
                    resolve();
                }, 2000);
            });

            assert.equal(mockStreamCreated, true, "Mock stream factory should have been invoked");
            assert.equal(
                socketClosed,
                true,
                "Server must destroy the socket after a mid-stream error so the connection is not leaked"
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
        const fds = await readdir(`/proc/${process.pid}/fd`);
        return fds.length;
    } catch {
        // On systems without /proc, return 0 (test will effectively be skipped)
        return 0;
    }
}
