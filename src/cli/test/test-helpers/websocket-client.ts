import WebSocket from "ws";

export interface HotReloadScriptPatch {
    kind: "script";
    id: string;
    js_body: string;
    [key: string]: unknown;
}

type PatchFilter = (patch: unknown) => patch is HotReloadScriptPatch;

export interface WebSocketPatchStream {
    websocketClient: WebSocket;
    receivedPatches: Array<HotReloadScriptPatch>;
    disconnect(): Promise<void>;
    waitForPatches: (options?: WaitForPatchesOptions) => Promise<Array<HotReloadScriptPatch>>;
}

export interface WebSocketPatchStreamOptions {
    shouldCollect?: PatchFilter;
    onParseError?: (error: unknown) => void;
    connectionTimeoutMs?: number;
    retryIntervalMs?: number;
}

const isScriptPatch: PatchFilter = (patch): patch is HotReloadScriptPatch => {
    const candidate = patch as Record<string, unknown>;

    return (
        typeof candidate === "object" &&
        candidate !== null &&
        candidate.kind === "script" &&
        typeof candidate.id === "string" &&
        typeof candidate.js_body === "string"
    );
};

export interface WaitForPatchesOptions {
    minCount?: number;
    timeoutMs?: number;
    predicate?: PatchFilter;
    startCount?: number;
}

const DEFAULT_CONNECTION_TIMEOUT_MS = 1000;
const DEFAULT_RETRY_INTERVAL_MS = 25;
const DEFAULT_WAIT_TIMEOUT_MS = 1500;
const DEFAULT_DISCONNECT_TIMEOUT_MS = 250;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function createTimeoutError(message: string): Error {
    return new Error(message);
}

async function connectWithRetry(
    websocketUrl: string,
    timeoutMs: number,
    retryIntervalMs: number,
    registerHandlers: (client: WebSocket) => void
): Promise<WebSocket> {
    const start = Date.now();
    let lastError: Error | null = null;

    while (Date.now() - start < timeoutMs) {
        try {
            const websocketClient = await new Promise<WebSocket>((resolve, reject) => {
                const client = new WebSocket(websocketUrl);
                registerHandlers(client);
                const cleanup = () => {
                    client.removeAllListeners("open");
                    client.removeAllListeners("error");
                };

                client.once("open", () => {
                    cleanup();
                    resolve(client);
                });

                client.once("error", (error) => {
                    cleanup();
                    client.close();
                    reject(
                        error instanceof Error
                            ? error
                            : new Error(`WebSocket error: ${error === undefined ? "unknown" : String(error)}`)
                    );
                });
            });

            return websocketClient;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            await delay(retryIntervalMs);
        }
    }

    throw createTimeoutError(
        `Timed out connecting to WebSocket at ${websocketUrl}: ${lastError?.message ?? "unknown error"}`
    );
}

export async function connectToHotReloadWebSocket(
    websocketUrl: string,
    options: WebSocketPatchStreamOptions = {}
): Promise<WebSocketPatchStream> {
    const receivedPatches: Array<HotReloadScriptPatch> = [];
    const filter = options.shouldCollect ?? isScriptPatch;
    const patchListeners = new Set<(patch: HotReloadScriptPatch) => void>();
    const websocketClient = await connectWithRetry(
        websocketUrl,
        options.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS,
        options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS,
        (client) => {
            client.on("message", (data) => {
                try {
                    const patch = JSON.parse(data.toString());
                    if (filter(patch)) {
                        receivedPatches.push(patch);
                        for (const listener of patchListeners) {
                            listener(patch);
                        }
                    }
                } catch (error) {
                    if (options.onParseError) {
                        options.onParseError(error);
                    }
                }
            });
        }
    );

    return {
        websocketClient,
        receivedPatches,
        waitForPatches: async (waitOptions: WaitForPatchesOptions = {}) => {
            const minCount = waitOptions.minCount ?? 1;
            const predicate =
                waitOptions.predicate ??
                ((patch: HotReloadScriptPatch): patch is HotReloadScriptPatch => patch !== undefined);
            const timeoutMs = waitOptions.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
            const startCount =
                typeof waitOptions.startCount === "number"
                    ? waitOptions.startCount
                    : receivedPatches.filter(predicate).length;

            if (startCount >= minCount) {
                return receivedPatches.filter(predicate).slice(-minCount);
            }

            return new Promise<Array<HotReloadScriptPatch>>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    patchListeners.delete(onPatch);
                    reject(
                        createTimeoutError(
                            `Timed out waiting for ${minCount} patch(es) from ${websocketUrl} after ${timeoutMs}ms`
                        )
                    );
                }, timeoutMs);

                const onPatch = () => {
                    const matches = receivedPatches.filter(predicate);
                    if (matches.length >= startCount + minCount) {
                        clearTimeout(timeoutId);
                        patchListeners.delete(onPatch);
                        resolve(matches.slice(-minCount));
                    }
                };

                patchListeners.add(onPatch);
            });
        },
        disconnect(): Promise<void> {
            return new Promise<void>((resolve) => {
                try {
                    const timeoutId = setTimeout(() => {
                        try {
                            websocketClient.terminate();
                        } finally {
                            resolve();
                        }
                    }, DEFAULT_DISCONNECT_TIMEOUT_MS);

                    websocketClient.once("close", () => {
                        clearTimeout(timeoutId);
                        resolve();
                    });

                    websocketClient.close();
                } catch {
                    resolve();
                }
            });
        }
    };
}
