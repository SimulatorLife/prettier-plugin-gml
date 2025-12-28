/**
 * HTTP status server for the watch command.
 *
 * Provides a simple HTTP endpoint that returns JSON status information about
 * the running watch command, including metrics, recent patches, errors, and
 * WebSocket client count.
 */

import {
    createServer,
    type Server,
    type IncomingMessage,
    type ServerResponse
} from "node:http";

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

export interface StatusServerController {
    url: string;
    host: string;
    port: number;
    stop(): Promise<void>;
}

const DEFAULT_STATUS_HOST = "127.0.0.1";
const DEFAULT_STATUS_PORT = 17_891;

function sendJsonResponse(
    res: ServerResponse,
    statusCode: number,
    data: unknown
): void {
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
    });
    res.end(JSON.stringify(data, null, 2));
}

function handleStatusRequest(
    _req: IncomingMessage,
    res: ServerResponse,
    getSnapshot: () => StatusSnapshot
): void {
    try {
        const snapshot = getSnapshot();
        sendJsonResponse(res, 200, snapshot);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendJsonResponse(res, 500, {
            error: "Failed to generate status snapshot",
            message
        });
    }
}

function handleNotFound(res: ServerResponse): void {
    sendJsonResponse(res, 404, {
        error: "Not found",
        message: "Only GET /status is supported"
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
        if (req.method === "GET" && req.url === "/status") {
            handleStatusRequest(req, res, getSnapshot);
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
    const actualHost =
        actualAddress && typeof actualAddress === "object"
            ? actualAddress.address
            : host;
    const actualPort =
        actualAddress && typeof actualAddress === "object"
            ? actualAddress.port
            : port;

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
