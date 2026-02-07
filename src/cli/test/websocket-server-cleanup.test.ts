import assert from "node:assert/strict";
import { describe, it } from "node:test";

import WebSocket, { type WebSocket as WebSocketType } from "ws";

import { startPatchWebSocketServer } from "../src/modules/websocket/server.js";

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

function waitForDisconnect(timeoutMs = 500): { done: Promise<void>; resolve: () => void } {
    let resolveFn: (value: void) => void;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const done = new Promise<void>((resolve, reject) => {
        resolveFn = resolve;
        timeoutId = setTimeout(() => {
            reject(new Error("Timed out waiting for client cleanup"));
        }, timeoutMs);
    });

    return {
        done,
        resolve: () => {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            resolveFn(undefined);
        }
    };
}

void describe("patch websocket server client cleanup", () => {
    void it("releases client tracking on socket error", async () => {
        let disconnectCount = 0;
        let serverSocket: WebSocketType;
        const disconnectSignal = waitForDisconnect();

        const server = await startPatchWebSocketServer({
            host: "127.0.0.1",
            port: 0,
            onClientConnect: (_clientId, socket) => {
                serverSocket = socket;
            },
            onClientDisconnect: () => {
                disconnectCount += 1;
                disconnectSignal.resolve();
            }
        });

        const client = new WebSocket(server.url);

        try {
            await waitForOpen(client);

            assert.ok(serverSocket, "expected server-side socket to be available");

            serverSocket.emit("error", new Error("synthetic client error"));

            await disconnectSignal.done;

            assert.equal(disconnectCount, 1, "expected disconnect cleanup to run once");
        } finally {
            client.terminate();
            await server.stop();
        }
    });
});
