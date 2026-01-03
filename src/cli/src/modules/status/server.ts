/**
 * HTTP status server for the watch command.
 *
 * Provides a simple HTTP endpoint that returns JSON status information about
 * the running watch command, including metrics, recent patches, errors, and
 * WebSocket client count.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { ServerEndpoint, ServerLifecycle } from "../shared-server-types.js";

export interface StatusSnapshot {
    uptime: number;
    patchCount: number;
    errorCount: number;
    recentPatches: Array<{
        id: string;
        timestamp: number;
        durationMs: number;
        filePath: string;
    }>;
    recentErrors: Array<{
        timestamp: number;
        filePath: string;
        error: string;
    }>;
    websocketClients: number;
}

export interface StatusServerOptions {
    host?: string;
    port?: number;
    getSnapshot: () => StatusSnapshot;
}

/**
 * Complete controller for the status HTTP server.
 *
 * Combines network endpoint and lifecycle management.
 * Consumers should depend on the minimal interface they need
 * (ServerEndpoint or ServerLifecycle) rather than this complete
 * interface when possible.
 */
export interface StatusServerController extends ServerEndpoint, ServerLifecycle {}

const DEFAULT_STATUS_HOST = "127.0.0.1";
const DEFAULT_STATUS_PORT = 17_891;

/**
 * Readiness threshold: server is considered ready if successful patches
 * outnumber errors by at least this ratio. This ensures the watcher is
 * operational even if occasional transpilation failures occur.
 */
const READINESS_SUCCESS_TO_ERROR_RATIO = 2;

function sendJsonResponse(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(data, null, 2));
}

function handleStatusRequest(_req: IncomingMessage, res: ServerResponse, getSnapshot: () => StatusSnapshot): void {
    try {
        const snapshot = getSnapshot();
        sendJsonResponse(res, 200, snapshot);
    } catch (error) {
        // Log detailed error information on the server, but do not expose it to the client.
        console.error("Failed to generate status snapshot:", error);
        sendJsonResponse(res, 500, {
            error: "Failed to generate status snapshot"
        });
    }
}

function handleHealthRequest(_req: IncomingMessage, res: ServerResponse, getSnapshot: () => StatusSnapshot): void {
    try {
        const snapshot = getSnapshot();
        const health = {
            status: "healthy",
            timestamp: Date.now(),
            uptime: snapshot.uptime,
            checks: {
                transpilation: {
                    status: snapshot.errorCount === 0 || snapshot.patchCount > snapshot.errorCount ? "pass" : "warn",
                    patchCount: snapshot.patchCount,
                    errorCount: snapshot.errorCount
                },
                websocket: {
                    status: "pass",
                    clients: snapshot.websocketClients
                    // Note: Status is always 'pass' based on current snapshot data.
                    // Future enhancement: integrate with websocket server lifecycle
                    // to detect server startup failures or connection issues.
                }
            }
        };
        sendJsonResponse(res, 200, health);
    } catch (error) {
        console.error("Failed to generate health check:", error);
        sendJsonResponse(res, 503, {
            status: "unhealthy",
            error: "Failed to generate health check"
        });
    }
}

function handlePingRequest(_req: IncomingMessage, res: ServerResponse): void {
    sendJsonResponse(res, 200, { status: "ok", timestamp: Date.now() });
}

function handleReadyRequest(_req: IncomingMessage, res: ServerResponse, getSnapshot: () => StatusSnapshot): void {
    try {
        const snapshot = getSnapshot();
        // Ready if the server is operational and not experiencing excessive errors.
        // We consider the server ready if successful patches outnumber errors by
        // the configured ratio, allowing for occasional transpilation failures
        // without marking the service as unavailable.
        const isReady =
            snapshot.errorCount === 0 || snapshot.patchCount > snapshot.errorCount * READINESS_SUCCESS_TO_ERROR_RATIO;
        const statusCode = isReady ? 200 : 503;
        sendJsonResponse(res, statusCode, {
            ready: isReady,
            timestamp: Date.now(),
            uptime: snapshot.uptime
        });
    } catch (error) {
        console.error("Failed to generate readiness check:", error);
        sendJsonResponse(res, 503, {
            ready: false,
            error: "Failed to generate readiness check"
        });
    }
}

function handleNotFound(res: ServerResponse): void {
    sendJsonResponse(res, 404, {
        error: "Not found",
        message: "Supported endpoints: GET /status, GET /health, GET /ping, GET /ready"
    });
}

/**
 * Creates and starts an HTTP status server.
 *
 * @param options - Server configuration
 * @returns Server controller with stop method
 */
export async function startStatusServer({
    host = DEFAULT_STATUS_HOST,
    port = DEFAULT_STATUS_PORT,
    getSnapshot
}: StatusServerOptions): Promise<StatusServerController> {
    const server: Server = createServer((req, res) => {
        if (req.method === "GET") {
            switch (req.url) {
                case "/status": {
                    handleStatusRequest(req, res, getSnapshot);

                    break;
                }
                case "/health": {
                    handleHealthRequest(req, res, getSnapshot);

                    break;
                }
                case "/ping": {
                    handlePingRequest(req, res);

                    break;
                }
                case "/ready": {
                    handleReadyRequest(req, res, getSnapshot);

                    break;
                }
                default: {
                    handleNotFound(res);
                }
            }
        } else {
            handleNotFound(res);
        }
    });

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
            server.off("error", reject);
            resolve();
        });
    });

    const actualAddress = server.address();
    const actualHost = actualAddress && typeof actualAddress === "object" ? actualAddress.address : host;
    const actualPort = actualAddress && typeof actualAddress === "object" ? actualAddress.port : port;

    return {
        url: `http://${actualHost}:${actualPort}/status`,
        host: actualHost,
        port: actualPort,
        async stop() {
            return new Promise<void>((resolve, reject) => {
                server.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }
    };
}
