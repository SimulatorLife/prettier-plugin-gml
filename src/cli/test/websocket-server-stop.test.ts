/**
 * Regression test: `PatchWebSocketServer.stop()` must resolve promptly even
 * when a connected WebSocket client is unresponsive.
 *
 * Root cause (without the fix)
 * ─────────────────────────────
 * The original `stop()` called `ws.close()` on each connected client.
 * `ws.close()` sends a WebSocket CLOSE frame to the peer and then waits for
 * the peer to echo it back before freeing the underlying TCP socket.  The `ws`
 * library's `WebSocketServer.close()` in turn only invokes its callback once
 * `wss.clients` is empty — i.e., once every connected socket has been freed.
 * If a peer is unresponsive (network partition, crashed browser, etc.) it
 * never echoes the CLOSE frame, the socket is never freed, and
 * `wss.close()` — and therefore `stop()` — hangs indefinitely.
 *
 * Fix
 * ───
 * `stop()` now calls `ws.terminate()` instead of `ws.close()`.
 * `ws.terminate()` immediately calls `socket.destroy()` on the underlying TCP
 * socket, which triggers the socket's `close` event synchronously (or on the
 * next tick), removing it from `wss.clients` without requiring any
 * acknowledgement from the peer.
 */

import assert from "node:assert/strict";
import { type Socket } from "node:net";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import WebSocket, { type WebSocket as WebSocketType } from "ws";

import { startPatchWebSocketServer } from "../src/modules/websocket/server.js";

/** Maximum time `stop()` is allowed to take when a client is unresponsive. */
const STOP_TIMEOUT_MS = 1000;

function waitForOpen(client: WebSocketType): Promise<void> {
    return new Promise((resolve, reject) => {
        const cleanup = () => {
            client.off("open", handleOpen);
            client.off("error", handleError);
        };
        const handleOpen = () => {
            cleanup();
            resolve();
        };
        const handleError = (error: Error) => {
            cleanup();
            reject(error);
        };
        client.on("open", handleOpen);
        client.on("error", handleError);
    });
}

void describe("patch websocket server stop", () => {
    /**
     * Reproduce the hang: pause the client's underlying TCP socket so it
     * cannot read or echo back the CLOSE frame, then assert that stop()
     * still completes within the allowed window.
     *
     * Without the fix (ws.close()): stop() never resolves because the CLOSE
     * handshake never completes.
     * With the fix (ws.terminate()): stop() resolves in <10 ms because the
     * server immediately destroys the socket.
     */
    void it("resolves promptly even when a connected client does not respond to the CLOSE frame", async () => {
        const server = await startPatchWebSocketServer({ host: "127.0.0.1", port: 0 });
        const client = new WebSocket(server.url);
        await waitForOpen(client);

        // Pause the client's underlying TCP socket so it cannot read incoming
        // data and therefore cannot send back the CLOSE frame.  This simulates
        // an unresponsive peer (e.g., network partition, process suspended).
        // Casting through `unknown` is required because `_socket` is an
        // internal property not exposed in the public TypeScript types.
        const underlying = (client as unknown as { _socket: Socket })._socket;
        underlying.pause();

        const stopPromise = server.stop();
        const timedOut = await Promise.race([stopPromise.then(() => false), delay(STOP_TIMEOUT_MS).then(() => true)]);

        // Always destroy the paused test socket so the OS resources are freed.
        // If stop() already completed, terminate() is a no-op; if stop() is
        // still waiting (i.e., the bug is present and the test is about to
        // fail), destroying the socket unblocks it so the process can exit
        // cleanly after the assertion.
        client.terminate();

        assert.equal(
            timedOut,
            false,
            `stop() did not complete within ${STOP_TIMEOUT_MS} ms even though the connected client ` +
                `is unresponsive; the underlying TCP socket was not terminated immediately`
        );
    });
});
