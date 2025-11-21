import { validatePatch } from "../runtime/patch-utils.js";
import type { Patch, RuntimePatchError } from "../runtime/types.js";
import type {
    MessageEventLike,
    RuntimeWebSocketClient,
    RuntimeWebSocketConstructor,
    RuntimeWebSocketInstance,
    WebSocketClientOptions,
    WebSocketClientState
} from "./types.js";

export function createWebSocketClient({
    url = "ws://127.0.0.1:17890",
    wrapper = null,
    onConnect,
    onDisconnect,
    onError,
    reconnectDelay = 800,
    autoConnect = true
}: WebSocketClientOptions = {}): RuntimeWebSocketClient {
    const state: WebSocketClientState = {
        ws: null,
        isConnected: false,
        reconnectTimer: null,
        manuallyDisconnected: false
    };

    const applyIncomingPatch = (incoming: unknown): boolean => {
        if (
            !incoming ||
            typeof incoming !== "object" ||
            !("kind" in incoming) ||
            !("id" in incoming)
        ) {
            return true;
        }

        const patchCandidate = incoming as Record<string, unknown>;
        try {
            validatePatch(patchCandidate);
        } catch (error) {
            if (onError) {
                const safeError = toRuntimePatchError(error);
                onError(safeError, "patch");
            }
            return false;
        }

        const patch = patchCandidate as Patch;

        if (wrapper?.trySafeApply) {
            try {
                const result = wrapper.trySafeApply(patch);

                if (!result || result.success !== true) {
                    const safeError = createRuntimePatchError(
                        result?.message ||
                            result?.error ||
                            `Failed to apply patch ${patch.id}`,
                        patch
                    );
                    safeError.rolledBack = result?.rolledBack;

                    if (onError) {
                        onError(safeError, "patch");
                    }

                    return false;
                }

                return true;
            } catch (error) {
                const safeError = toRuntimePatchError(error, patch);
                safeError.rolledBack =
                    error && typeof error === "object" && "rolledBack" in error
                        ? (error as { rolledBack?: boolean }).rolledBack
                        : undefined;

                if (onError) {
                    onError(safeError, "patch");
                }

                return false;
            }
        }

        if (wrapper) {
            try {
                wrapper.applyPatch(patch);
                return true;
            } catch (error) {
                const safeError = toRuntimePatchError(error, patch);
                if (onError) {
                    onError(safeError, "patch");
                }
                return false;
            }
        }

        return true;
    };

    function connect() {
        if (state.ws && state.isConnected) {
            return;
        }

        state.manuallyDisconnected = false;

        try {
            const ctor = resolveWebSocketConstructor();
            state.ws = new ctor(url);

            state.ws.addEventListener("open", () => {
                state.isConnected = true;

                if (state.reconnectTimer) {
                    clearTimeout(state.reconnectTimer);
                    state.reconnectTimer = null;
                }

                if (onConnect) {
                    onConnect();
                }
            });

            state.ws.addEventListener("message", (event) => {
                if (!wrapper) {
                    return;
                }

                let payload: unknown;

                try {
                    if (
                        !event ||
                        typeof event !== "object" ||
                        !("data" in event)
                    ) {
                        return;
                    }

                    const message = (event as MessageEventLike).data;
                    payload = JSON.parse(message);
                } catch (error) {
                    if (onError) {
                        const safeError = toRuntimePatchError(error);
                        onError(safeError, "patch");
                    }
                    return;
                }

                const patches = Array.isArray(payload) ? payload : [payload];

                for (const patch of patches) {
                    try {
                        const applied = applyIncomingPatch(patch);
                        if (!applied) {
                            break;
                        }
                    } catch (error) {
                        if (onError) {
                            const safeError = toRuntimePatchError(error);
                            onError(safeError, "patch");
                        }
                        break;
                    }
                }
            });

            state.ws.addEventListener("close", () => {
                state.isConnected = false;
                state.ws = null;

                if (onDisconnect) {
                    onDisconnect();
                }

                if (!state.manuallyDisconnected && reconnectDelay > 0) {
                    state.reconnectTimer = setTimeout(() => {
                        connect();
                    }, reconnectDelay);
                }
            });

            state.ws.addEventListener("error", (event) => {
                if (state.ws) {
                    state.ws.close();
                }

                if (onError) {
                    const safeError = createRuntimePatchError(
                        event instanceof Error
                            ? event.message
                            : "Unknown WebSocket error"
                    );
                    onError(safeError, "connection");
                }
            });
        } catch (error) {
            if (onError) {
                const safeError = toRuntimePatchError(error);
                onError(safeError, "connection");
            }
        }
    }

    function disconnect() {
        state.manuallyDisconnected = true;

        if (state.reconnectTimer) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }

        if (state.ws) {
            state.ws.close();
            state.ws = null;
        }

        state.isConnected = false;
    }

    function isConnected(): boolean {
        return state.isConnected;
    }

    function send(data: string | unknown) {
        if (!state.ws || !state.isConnected) {
            throw new Error("WebSocket is not connected");
        }

        const message = typeof data === "string" ? data : JSON.stringify(data);
        state.ws.send(message);
    }

    function getWebSocket(): RuntimeWebSocketInstance | null {
        return state.ws;
    }

    if (autoConnect) {
        connect();
    }

    return {
        connect,
        disconnect,
        isConnected,
        send,
        getWebSocket
    };
}

function resolveWebSocketConstructor(): RuntimeWebSocketConstructor {
    const ctor = (globalThis as { WebSocket?: RuntimeWebSocketConstructor })
        .WebSocket;
    if (!ctor) {
        throw new Error("WebSocket global is not available");
    }

    return ctor;
}

function toRuntimePatchError(error: unknown, patch?: Patch): RuntimePatchError {
    const message =
        error instanceof Error
            ? error.message
            : String(error ?? "Unknown error");
    return createRuntimePatchError(message, patch);
}

function createRuntimePatchError(
    message: string,
    patch?: Patch
): RuntimePatchError {
    const runtimeError = new Error(message) as RuntimePatchError;
    runtimeError.patch = patch;
    return runtimeError;
}
