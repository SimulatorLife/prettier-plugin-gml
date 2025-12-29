/**
 * WebSocket server for streaming hot-reload patches to connected clients.
 *
 * This module provides the server-side WebSocket implementation for the hot-reload
 * development pipeline. It broadcasts transpiled patches to all connected runtime
 * wrapper clients when GML source files change.
 */

import { WebSocketServer, WebSocket } from "ws";
import { Core } from "@gml-modules/core";
import type {
    ServerEndpoint,
    ServerLifecycle
} from "../shared-server-types.js";

const { describeValueForError } = Core;

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 17_890;

export interface PatchWebSocketServerOptions {
    host?: string;
    port?: number;
    verbose?: boolean;
    onClientConnect?: (clientId: string, socket: WebSocket) => void;
    onClientDisconnect?: (clientId: string) => void;
    prepareInitialMessages?: () => Iterable<unknown>;
}

export interface PatchBroadcastResult {
    successCount: number;
    failureCount: number;
    totalClients: number;
}

/**
 * Patch broadcasting operations.
 *
 * Provides message distribution and client tracking specific to the
 * WebSocket patch server without coupling to endpoint or lifecycle concerns.
 */
export interface PatchBroadcaster {
    broadcast(patch: unknown): PatchBroadcastResult;
    getClientCount(): number;
}

/**
 * Complete controller for the patch WebSocket server.
 *
 * Combines network endpoint, lifecycle management, and patch broadcasting.
 * Consumers should depend on the minimal interface they need
 * (ServerEndpoint, ServerLifecycle, or PatchBroadcaster) rather
 * than this complete interface when possible.
 */
export interface PatchWebSocketServerController
    extends ServerEndpoint,
        ServerLifecycle,
        PatchBroadcaster {}

/**
 * Creates and starts a WebSocket server for patch streaming.
 *
 * @param {object} options - Server configuration options
 * @param {string} [options.host] - Host to bind to
 * @param {number} [options.port] - Port to listen on
 * @param {boolean} [options.verbose] - Enable verbose logging
 * @param {Function} [options.onClientConnect] - Callback when a client connects
 * @param {Function} [options.onClientDisconnect] - Callback when a client disconnects
 * @param {Function} [options.prepareInitialMessages] - Supplier for messages sent to new clients immediately after connecting
 * @returns {Promise<object>} Server controller with broadcast and stop methods
 */
export async function startPatchWebSocketServer({
    host = DEFAULT_HOST,
    port = DEFAULT_PORT,
    verbose = false,
    onClientConnect,
    onClientDisconnect,
    prepareInitialMessages
}: PatchWebSocketServerOptions = {}): Promise<PatchWebSocketServerController> {
    const clients = new Set<WebSocket>();
    const clientIds = new Map<WebSocket, string>();

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

    const READY_STATE_OPEN = 1;

    function sendJsonMessage(
        ws: WebSocket,
        payload: unknown,
        clientId: string
    ): boolean {
        try {
            const message = JSON.stringify(payload);

            if (ws.readyState !== READY_STATE_OPEN) {
                return false;
            }

            ws.send(message);
            return true;
        } catch (error) {
            if (verbose) {
                const message =
                    error instanceof Error ? error.message : String(error);
                console.error(
                    `[WebSocket] Failed to send to ${clientId}: ${message}`
                );
            }
            return false;
        }
    }

    wss.on("connection", (ws, request) => {
        const clientId = `${request.socket.remoteAddress}:${request.socket.remotePort}`;

        clients.add(ws);
        clientIds.set(ws, clientId);

        if (verbose) {
            console.log(`[WebSocket] Client connected: ${clientId}`);
        }

        if (onClientConnect) {
            onClientConnect(clientId, ws);
        }

        if (prepareInitialMessages) {
            try {
                let replayedCount = 0;
                for (const payload of prepareInitialMessages()) {
                    if (sendJsonMessage(ws, payload, clientId)) {
                        replayedCount += 1;
                    }
                }

                if (verbose && replayedCount > 0) {
                    console.log(
                        `[WebSocket] Sent ${replayedCount} queued message(s) to ${clientId}`
                    );
                }
            } catch (error) {
                if (verbose) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    console.error(
                        `[WebSocket] Failed to send initial messages to ${clientId}: ${message}`
                    );
                }
            }
        }

        ws.on("close", () => {
            clients.delete(ws);
            clientIds.delete(ws);

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
        let successCount = 0;
        let failureCount = 0;

        for (const ws of clients) {
            const clientId = clientIds.get(ws) ?? "[unknown]";
            const sent = sendJsonMessage(ws, patch, clientId);
            successCount += sent ? 1 : 0;
            failureCount += sent ? 0 : 1;
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
