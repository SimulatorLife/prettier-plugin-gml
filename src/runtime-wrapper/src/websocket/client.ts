import { validatePatch } from "../runtime/patch-utils.js";
import type {
    Patch,
    RuntimePatchError,
    RuntimeWrapper,
    TrySafeApplyResult
} from "../runtime/types.js";
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
        const patchResult = validatePatchCandidate(incoming, onError);
        if (patchResult.status === "skip") {
            return true;
        }

        if (patchResult.status === "error") {
            return false;
        }

        const patch = patchResult.patch;

        if (wrapper && wrapper.trySafeApply) {
            return applyPatchSafely(patch, wrapper, onError);
        }

        if (wrapper) {
            return applyPatchDirectly(patch, wrapper, onError);
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
            const ws = new ctor(url);
            state.ws = ws;

            attachWebSocketEventListeners(ws, {
                state,
                wrapper,
                onConnect,
                onDisconnect,
                onError,
                reconnectDelay,
                applyIncomingPatch,
                connect
            });
        } catch (error) {
            handleConnectionError(error, onError);
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

    function send(data: unknown) {
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

type WebSocketEventListenerArgs = {
    state: WebSocketClientState;
    wrapper: WebSocketClientOptions["wrapper"];
    onConnect?: WebSocketClientOptions["onConnect"];
    onDisconnect?: WebSocketClientOptions["onDisconnect"];
    onError?: WebSocketClientOptions["onError"];
    reconnectDelay: number;
    applyIncomingPatch: (incoming: unknown) => boolean;
    connect: () => void;
};

type WebSocketMessageHandlerArgs = {
    wrapper: WebSocketClientOptions["wrapper"];
    applyIncomingPatch: (incoming: unknown) => boolean;
    onError?: WebSocketClientOptions["onError"];
};

type WebSocketCloseHandlerArgs = {
    state: WebSocketClientState;
    onDisconnect?: WebSocketClientOptions["onDisconnect"];
    reconnectDelay: number;
    connect: () => void;
};

type WebSocketErrorHandlerArgs = {
    state: WebSocketClientState;
    onError?: WebSocketClientOptions["onError"];
};

function attachWebSocketEventListeners(
    ws: RuntimeWebSocketInstance,
    args: WebSocketEventListenerArgs
): void {
    ws.addEventListener("open", createOpenHandler(args.state, args.onConnect));
    ws.addEventListener(
        "message",
        createMessageHandler({
            wrapper: args.wrapper,
            applyIncomingPatch: args.applyIncomingPatch,
            onError: args.onError
        })
    );
    ws.addEventListener(
        "close",
        createCloseHandler({
            state: args.state,
            onDisconnect: args.onDisconnect,
            reconnectDelay: args.reconnectDelay,
            connect: args.connect
        })
    );
    ws.addEventListener(
        "error",
        createErrorHandler({
            state: args.state,
            onError: args.onError
        })
    );
}

function createOpenHandler(
    state: WebSocketClientState,
    onConnect?: WebSocketClientOptions["onConnect"]
): () => void {
    return () => {
        const websocketState = state;
        websocketState.isConnected = true;

        if (websocketState.reconnectTimer) {
            clearTimeout(websocketState.reconnectTimer);
            websocketState.reconnectTimer = null;
        }

        if (onConnect) {
            onConnect();
        }
    };
}

function createMessageHandler({
    wrapper,
    applyIncomingPatch,
    onError
}: WebSocketMessageHandlerArgs): (event?: MessageEventLike | Error) => void {
    return (event?: MessageEventLike | Error) => {
        if (!wrapper) {
            return;
        }

        const payload = parseWebSocketPayload(event, onError);
        if (payload === undefined) {
            return;
        }

        const patches = Array.isArray(payload) ? payload : [payload];
        for (const patch of patches) {
            if (!applyIncomingPatch(patch)) {
                break;
            }
        }
    };
}

function parseWebSocketPayload(
    event: MessageEventLike | Error | undefined,
    onError?: WebSocketClientOptions["onError"]
): unknown {
    let payload: unknown = undefined;

    if (event && typeof event === "object" && "data" in event) {
        try {
            const message = event.data;
            payload = JSON.parse(String(message));
        } catch (error) {
            if (onError) {
                const safeError = toRuntimePatchError(error);
                onError(safeError, "patch");
            }
        }
    }

    return payload;
}

function createCloseHandler({
    state,
    onDisconnect,
    reconnectDelay,
    connect
}: WebSocketCloseHandlerArgs): () => void {
    return () => {
        const websocketState = state;
        websocketState.isConnected = false;
        websocketState.ws = null;

        if (onDisconnect) {
            onDisconnect();
        }

        if (!websocketState.manuallyDisconnected && reconnectDelay > 0) {
            websocketState.reconnectTimer = setTimeout(() => {
                connect();
            }, reconnectDelay);
        }
    };
}

function createErrorHandler({
    state,
    onError
}: WebSocketErrorHandlerArgs): (event?: Error) => void {
    return (event?: Error) => {
        const websocketState = state;
        if (websocketState.ws) {
            websocketState.ws.close();
        }

        if (onError) {
            const safeError = createRuntimePatchError(
                event instanceof Error
                    ? event.message
                    : "Unknown WebSocket error"
            );
            onError(safeError, "connection");
        }
    };
}

function handleConnectionError(
    error: unknown,
    onError?: WebSocketClientOptions["onError"]
): void {
    if (!onError) {
        return;
    }

    const safeError = toRuntimePatchError(error);
    onError(safeError, "connection");
}

type PatchValidationResult =
    | { status: "skip" }
    | { status: "error" }
    | { status: "ok"; patch: Patch };

function validatePatchCandidate(
    incoming: unknown,
    onError?: WebSocketClientOptions["onError"]
): PatchValidationResult {
    if (
        !incoming ||
        typeof incoming !== "object" ||
        !("kind" in incoming) ||
        !("id" in incoming)
    ) {
        return { status: "skip" };
    }

    const patchCandidate = incoming as Record<string, unknown>;
    try {
        validatePatch(patchCandidate);
    } catch (error) {
        if (onError) {
            const safeError = toRuntimePatchError(error);
            onError(safeError, "patch");
        }
        return { status: "error" };
    }

    return { status: "ok", patch: patchCandidate as Patch };
}

function applyPatchSafely(
    patch: Patch,
    wrapper: RuntimeWrapper,
    onError?: WebSocketClientOptions["onError"]
): boolean {
    try {
        const result = wrapper.trySafeApply(patch);
        return handleSafeApplyResult(result, patch, onError);
    } catch (error) {
        return handleSafeApplyException(error, patch, onError);
    }
}

function handleSafeApplyResult(
    result: TrySafeApplyResult | undefined,
    patch: Patch,
    onError?: WebSocketClientOptions["onError"]
): boolean {
    if (result && result.success === true) {
        return true;
    }

    const safeError = createRuntimePatchError(
        result?.message ?? result?.error ?? `Failed to apply patch ${patch.id}`,
        patch
    );
    safeError.rolledBack = result?.rolledBack;

    if (onError) {
        onError(safeError, "patch");
    }

    return false;
}

function handleSafeApplyException(
    error: unknown,
    patch: Patch,
    onError?: WebSocketClientOptions["onError"]
): boolean {
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

function applyPatchDirectly(
    patch: Patch,
    wrapper: RuntimeWrapper,
    onError?: WebSocketClientOptions["onError"]
): boolean {
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

function resolveWebSocketConstructor(): RuntimeWebSocketConstructor {
    const ctor = (globalThis as { WebSocket?: RuntimeWebSocketConstructor })
        .WebSocket;
    if (!ctor) {
        throw new Error("WebSocket global is not available");
    }

    return ctor;
}

function toRuntimePatchError(error: unknown, patch?: Patch): RuntimePatchError {
    const message = resolveRuntimeErrorMessage(error);
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

function resolveRuntimeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === "string") {
        return error;
    }

    if (
        typeof error === "number" ||
        typeof error === "boolean" ||
        typeof error === "bigint" ||
        typeof error === "symbol"
    ) {
        return String(error);
    }

    if (error && typeof error === "object" && "message" in error) {
        const messageCandidate = (error as { message?: unknown }).message;
        if (typeof messageCandidate === "string") {
            return messageCandidate;
        }
    }

    return "Unknown error";
}
