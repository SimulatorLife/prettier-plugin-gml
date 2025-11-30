/**
 * WebSocket server for streaming hot-reload patches to connected clients.
 *
 * This module provides the server-side WebSocket implementation for the hot-reload
 * development pipeline. It broadcasts transpiled patches to all connected runtime
 * wrapper clients when GML source files change.
 */

import { WebSocketServer, WebSocket } from "ws";
import { describeValueForError } from "../dependencies.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 17_890;

export interface PatchWebSocketServerOptions {
    host?: string;
    port?: number;
    verbose?: boolean;
    onClientConnect?: (clientId: string) => void;
    onClientDisconnect?: (clientId: string) => void;
}

export interface PatchBroadcastResult {
    successCount: number;
    failureCount: number;
    totalClients: number;
}

export interface PatchWebSocketServerController {
    url: string;
    host: string;
    port: number;
    broadcast(patch: unknown): PatchBroadcastResult;
    stop(): Promise<void>;
    getClientCount(): number;
}

/**
 * Creates and starts a WebSocket server for patch streaming.
 *
 * @param {object} options - Server configuration options
 * @param {string} [options.host] - Host to bind to
 * @param {number} [options.port] - Port to listen on
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @param {Function} [options.onClientConnect] - Callback when a client connects
 * @param {Function} [options.onClientDisconnect] - Callback when a client disconnects
 * @returns {Promise<object>} Server controller with broadcast and stop methods
 */
export async function startPatchWebSocketServer({
    host = DEFAULT_HOST,
    port = DEFAULT_PORT,
    verbose = false,
    onClientConnect,
    onClientDisconnect
}: PatchWebSocketServerOptions = {}): Promise<PatchWebSocketServerController> {
    const clients = new Set<WebSocket>();

    const wss = new WebSocketServer({
        host,
        port
    });

    await new Promise<void>((resolve, reject) => {
        wss.once("error", reject);
        wss.once("listening", () => {
            wss.off("error", reject);
            resolve();
        });
    });

    wss.on("connection", (ws, request) => {
        const clientId = `${request.socket.remoteAddress}:${request.socket.remotePort}`;

        clients.add(ws);

        if (verbose) {
            console.log(`[WebSocket] Client connected: ${clientId}`);
        }

        if (onClientConnect) {
            onClientConnect(clientId);
        }

        ws.on("close", () => {
            clients.delete(ws);

            if (verbose) {
                console.log(`[WebSocket] Client disconnected: ${clientId}`);
            }

            if (onClientDisconnect) {
                onClientDisconnect(clientId);
            }
        });

        ws.on("error", (error) => {
            if (verbose) {
                console.error(
                    `[WebSocket] Client error (${clientId}):`,
                    error.message
                );
            }
        });
    });

    wss.on("error", (error) => {
        if (verbose) {
            console.error("[WebSocket] Server error:", error.message);
        }
    });

    const address = wss.address();
    const resolvedHost = host ?? DEFAULT_HOST;
    const resolvedPort =
        typeof address === "object" ? address.port : DEFAULT_PORT;
    const url = `ws://${resolvedHost}:${resolvedPort}`;

    if (verbose) {
        console.log(`[WebSocket] Server listening at ${url}`);
    }

    let closed = false;

    /**
     * Broadcasts a patch to all connected clients.
     *
     * @param {object} patch - Patch object to broadcast
     */
    function broadcast(patch: unknown): PatchBroadcastResult {
        const message = JSON.stringify(patch);
        let successCount = 0;
        let failureCount = 0;

        for (const ws of clients) {
            try {
                // Compare against numeric READY_STATE constant for OPEN (1).
                // Some ws client instances do not expose the static OPEN property
                // on the instance, so using the numeric value avoids undefined
                // comparisons that would prevent sending messages.
                if (ws.readyState === 1) {
                    ws.send(message);
                    successCount += 1;
                } else {
                    failureCount += 1;
                }
            } catch (error) {
                failureCount += 1;
                if (verbose) {
                    console.error(
                        "[WebSocket] Failed to send to client:",
                        error.message
                    );
                }
            }
        }

        return { successCount, failureCount, totalClients: clients.size };
    }

    /**
     * Stops the WebSocket server and closes all connections.
     */
    async function stop() {
        if (closed) {
            return;
        }
        closed = true;

        for (const ws of clients) {
            try {
                ws.close();
            } catch {
                // Ignore close errors
            }
        }

        clients.clear();

        await new Promise<void>((resolve, reject) => {
            const rejectWithError = (reason: unknown): void => {
                if (reason instanceof Error) {
                    reject(reason);
                    return;
                }

                const description = describeValueForError(
                    reason ?? "[WebSocket] Unknown server shutdown failure"
                );

                reject(new Error(description));
            };

            wss.close((error) => {
                if (error) {
                    rejectWithError(error);
                    return;
                }

                resolve();
            });
        });

        if (verbose) {
            console.log("[WebSocket] Server stopped");
        }
    }

    return {
        url,
        host: resolvedHost,
        port: resolvedPort,
        broadcast,
        stop,
        getClientCount: () => clients.size
    };
}
