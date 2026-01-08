import { Core } from "@gml-modules/core";
import { validatePatch } from "../runtime/patch-utils.js";
import type { Patch, PatchApplicator, RuntimePatchError, TrySafeApplyResult } from "../runtime/types.js";
import type {
    MessageEventLike,
    PatchQueueMetrics,
    PatchQueueState,
    RuntimeWebSocketClient,
    RuntimeWebSocketConstructor,
    RuntimeWebSocketInstance,
    WebSocketClientOptions,
    WebSocketClientState,
    WebSocketConnectionMetrics
} from "./types.js";

const DEFAULT_MAX_QUEUE_SIZE = 100;
const DEFAULT_FLUSH_INTERVAL_MS = 50;

function createInitialMetrics(): WebSocketConnectionMetrics {
    return {
        totalConnections: 0,
        totalDisconnections: 0,
        totalReconnectAttempts: 0,
        patchesReceived: 0,
        patchesApplied: 0,
        patchesFailed: 0,
        lastConnectedAt: null,
        lastDisconnectedAt: null,
        lastPatchReceivedAt: null,
        lastPatchAppliedAt: null,
        connectionErrors: 0,
        patchErrors: 0
    };
}

function createInitialQueueMetrics(): PatchQueueMetrics {
    return {
        totalQueued: 0,
        totalFlushed: 0,
        totalDropped: 0,
        maxQueueDepth: 0,
        flushCount: 0,
        lastFlushSize: 0,
        lastFlushedAt: null
    };
}

function createPatchQueueState(): PatchQueueState {
    return {
        queue: [],
        flushTimer: null,
        queueMetrics: createInitialQueueMetrics()
    };
}

export function createWebSocketClient({
    url = "ws://127.0.0.1:17890",
    wrapper = null,
    onConnect,
    onDisconnect,
    onError,
    reconnectDelay = 800,
    autoConnect = true,
    patchQueue
}: WebSocketClientOptions = {}): RuntimeWebSocketClient {
    const queueEnabled = patchQueue?.enabled ?? false;
    const maxQueueSize = patchQueue?.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE;
    const flushIntervalMs = patchQueue?.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;

    const state: WebSocketClientState = {
        ws: null,
        isConnected: false,
        reconnectTimer: null,
        manuallyDisconnected: false,
        connectionMetrics: createInitialMetrics(),
        patchQueue: queueEnabled ? createPatchQueueState() : null
    };

    const flushQueuedPatches = (): number => {
        if (!state.patchQueue || !wrapper) {
            return 0;
        }

        const queueState = state.patchQueue;
        if (queueState.queue.length === 0) {
            return 0;
        }

        if (queueState.flushTimer !== null) {
            clearTimeout(queueState.flushTimer);
            queueState.flushTimer = null;
        }

        const patchesToFlush = queueState.queue.splice(0);
        const flushSize = patchesToFlush.length;

        queueState.queueMetrics.flushCount += 1;
        queueState.queueMetrics.lastFlushSize = flushSize;
        queueState.queueMetrics.lastFlushedAt = Date.now();

        if (wrapper.applyPatchBatch) {
            const result = wrapper.applyPatchBatch(patchesToFlush);
            const applied = result.success ? result.appliedCount : result.appliedCount;
            const failed = flushSize - applied;

            state.connectionMetrics.patchesApplied += applied;
            state.connectionMetrics.patchesFailed += failed;
            queueState.queueMetrics.totalFlushed += applied;

            if (result.success) {
                state.connectionMetrics.lastPatchAppliedAt = Date.now();
            }
        } else {
            let applied = 0;
            for (const patch of patchesToFlush) {
                const success = applyIncomingPatch(patch);
                if (success) {
                    applied += 1;
                }
            }
            queueState.queueMetrics.totalFlushed += applied;
        }

        return flushSize;
    };

    const scheduleFlush = (): void => {
        if (!state.patchQueue) {
            return;
        }

        const queueState = state.patchQueue;
        if (queueState.flushTimer !== null) {
            return;
        }

        queueState.flushTimer = setTimeout(() => {
            queueState.flushTimer = null;
            flushQueuedPatches();
        }, flushIntervalMs);
    };

    const enqueuePatch = (patch: unknown): void => {
        if (!state.patchQueue) {
            return;
        }

        const queueState = state.patchQueue;

        if (queueState.queue.length >= maxQueueSize) {
            queueState.queue.shift();
            queueState.queueMetrics.totalDropped += 1;
        }

        queueState.queue.push(patch);
        queueState.queueMetrics.totalQueued += 1;

        const currentDepth = queueState.queue.length;
        if (currentDepth > queueState.queueMetrics.maxQueueDepth) {
            queueState.queueMetrics.maxQueueDepth = currentDepth;
        }

        if (currentDepth >= maxQueueSize) {
            flushQueuedPatches();
        } else {
            scheduleFlush();
        }
    };

    const applyIncomingPatch = (incoming: unknown): boolean => {
        state.connectionMetrics.patchesReceived += 1;
        state.connectionMetrics.lastPatchReceivedAt = Date.now();

        const patchResult = validatePatchCandidate(incoming, onError);
        if (patchResult.status === "skip") {
            state.connectionMetrics.patchErrors += 1;
            return true;
        }

        if (patchResult.status === "error") {
            state.connectionMetrics.patchesFailed += 1;
            state.connectionMetrics.patchErrors += 1;
            return false;
        }

        const patch = patchResult.patch;

        if (wrapper && wrapper.trySafeApply) {
            const applied = applyPatchSafely(patch, wrapper, onError);
            if (applied) {
                state.connectionMetrics.patchesApplied += 1;
                state.connectionMetrics.lastPatchAppliedAt = Date.now();
            } else {
                state.connectionMetrics.patchesFailed += 1;
                state.connectionMetrics.patchErrors += 1;
            }
            return applied;
        }

        if (wrapper) {
            const applied = applyPatchDirectly(patch, wrapper, onError);
            if (applied) {
                state.connectionMetrics.patchesApplied += 1;
                state.connectionMetrics.lastPatchAppliedAt = Date.now();
            } else {
                state.connectionMetrics.patchesFailed += 1;
                state.connectionMetrics.patchErrors += 1;
            }
            return applied;
        }

        return true;
    };

    function connect() {
        if (state.ws && state.isConnected) {
            return;
        }

        state.manuallyDisconnected = false;

        // Clear any pending reconnect timer before establishing a new connection
        // This ensures that if connect() is called while a reconnect is scheduled,
        // we don't leak the timer or create duplicate connection attempts
        if (state.reconnectTimer !== null) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }

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
                enqueuePatch,
                connect
            });
        } catch (error) {
            handleConnectionError(error, onError);
        }
    }

    function disconnect() {
        state.manuallyDisconnected = true;

        if (state.patchQueue) {
            if (state.patchQueue.flushTimer !== null) {
                clearTimeout(state.patchQueue.flushTimer);
                state.patchQueue.flushTimer = null;
            }
            flushQueuedPatches();
        }

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

    function getConnectionMetrics(): Readonly<WebSocketConnectionMetrics> {
        return Object.freeze({ ...state.connectionMetrics });
    }

    function resetConnectionMetrics(): void {
        state.connectionMetrics = createInitialMetrics();
    }

    function getPatchQueueMetrics(): Readonly<PatchQueueMetrics> | null {
        if (!state.patchQueue) {
            return null;
        }
        return Object.freeze({ ...state.patchQueue.queueMetrics });
    }

    function flushPatchQueue(): number {
        return flushQueuedPatches();
    }

    if (autoConnect) {
        connect();
    }

    return {
        connect,
        disconnect,
        isConnected,
        send,
        getWebSocket,
        getConnectionMetrics,
        resetConnectionMetrics,
        getPatchQueueMetrics,
        flushPatchQueue
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
    enqueuePatch: (patch: unknown) => void;
    connect: () => void;
};

type WebSocketMessageHandlerArgs = {
    state: WebSocketClientState;
    wrapper: WebSocketClientOptions["wrapper"];
    applyIncomingPatch: (incoming: unknown) => boolean;
    enqueuePatch: (patch: unknown) => void;
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

function attachWebSocketEventListeners(ws: RuntimeWebSocketInstance, args: WebSocketEventListenerArgs): void {
    ws.addEventListener("open", createOpenHandler(args.state, args.onConnect));
    ws.addEventListener(
        "message",
        createMessageHandler({
            state: args.state,
            wrapper: args.wrapper,
            applyIncomingPatch: args.applyIncomingPatch,
            enqueuePatch: args.enqueuePatch,
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

function createOpenHandler(state: WebSocketClientState, onConnect?: WebSocketClientOptions["onConnect"]): () => void {
    return () => {
        const websocketState = state;
        websocketState.isConnected = true;
        websocketState.connectionMetrics.totalConnections += 1;
        websocketState.connectionMetrics.lastConnectedAt = Date.now();

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
    state,
    wrapper,
    applyIncomingPatch,
    enqueuePatch,
    onError
}: WebSocketMessageHandlerArgs): (event?: MessageEventLike | Error) => void {
    return (event?: MessageEventLike | Error) => {
        if (!wrapper) {
            return;
        }

        const payload = parseWebSocketPayload(event, onError);
        if (payload === null) {
            return;
        }

        const patches = Core.toArray(payload);

        if (state.patchQueue) {
            for (const patch of patches) {
                enqueuePatch(patch);
            }
        } else {
            for (const patch of patches) {
                if (!applyIncomingPatch(patch)) {
                    break;
                }
            }
        }
    };
}

function parseWebSocketPayload(
    event: MessageEventLike | Error | undefined,
    onError?: WebSocketClientOptions["onError"]
): unknown {
    if (!event || typeof event !== "object" || !("data" in event)) {
        return null;
    }

    const message = event.data;

    if (isStructuredPayload(message)) {
        return message;
    }

    if (isBinaryPayload(message)) {
        return decodeBinaryPayload(message, onError);
    }

    if (typeof message !== "string") {
        return null;
    }

    try {
        return JSON.parse(message);
    } catch (error) {
        if (onError) {
            const safeError = toRuntimePatchError(error);
            onError(safeError, "patch");
        }

        return null;
    }
}

function isStructuredPayload(value: unknown): value is object {
    return Boolean(value) && typeof value === "object" && !isBinaryPayload(value);
}

function isBinaryPayload(value: unknown): value is ArrayBuffer | ArrayBufferView {
    return value instanceof ArrayBuffer || ArrayBuffer.isView(value);
}

function decodeBinaryPayload(
    payload: ArrayBuffer | ArrayBufferView,
    onError?: WebSocketClientOptions["onError"]
): unknown {
    try {
        const view = toUint8Array(payload);
        const decoded = new TextDecoder().decode(view);
        return JSON.parse(decoded);
    } catch (error) {
        if (onError) {
            const safeError = toRuntimePatchError(error);
            onError(safeError, "patch");
        }

        return null;
    }
}

function toUint8Array(payload: ArrayBuffer | ArrayBufferView): Uint8Array {
    if (payload instanceof ArrayBuffer) {
        return new Uint8Array(payload);
    }

    return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
}

function createCloseHandler({ state, onDisconnect, reconnectDelay, connect }: WebSocketCloseHandlerArgs): () => void {
    return () => {
        const websocketState = state;
        websocketState.isConnected = false;
        websocketState.ws = null;
        websocketState.connectionMetrics.totalDisconnections += 1;
        websocketState.connectionMetrics.lastDisconnectedAt = Date.now();

        if (onDisconnect) {
            onDisconnect();
        }

        // Clear any existing reconnect timer before potentially setting a new one
        // This prevents timer leaks when close events occur in rapid succession
        // or when the WebSocket is closed externally (e.g., server disconnect, network error)
        if (websocketState.reconnectTimer !== null) {
            clearTimeout(websocketState.reconnectTimer);
            websocketState.reconnectTimer = null;
        }

        if (!websocketState.manuallyDisconnected && reconnectDelay > 0) {
            websocketState.connectionMetrics.totalReconnectAttempts += 1;
            websocketState.reconnectTimer = setTimeout(() => {
                connect();
            }, reconnectDelay);
        }
    };
}

function createErrorHandler({ state, onError }: WebSocketErrorHandlerArgs): (event?: Error) => void {
    return (event?: Error) => {
        const websocketState = state;
        websocketState.connectionMetrics.connectionErrors += 1;

        if (websocketState.ws) {
            websocketState.ws.close();
        }

        if (onError) {
            const safeError = createRuntimePatchError(
                Core.isErrorLike(event) ? event.message : "Unknown WebSocket error"
            );
            onError(safeError, "connection");
        }
    };
}

function handleConnectionError(error: unknown, onError?: WebSocketClientOptions["onError"]): void {
    if (!onError) {
        return;
    }

    const safeError = toRuntimePatchError(error);
    onError(safeError, "connection");
}

type PatchValidationResult = { status: "skip" } | { status: "error" } | { status: "ok"; patch: Patch };

function validatePatchCandidate(incoming: unknown, onError?: WebSocketClientOptions["onError"]): PatchValidationResult {
    if (!incoming || typeof incoming !== "object") {
        reportMalformedPatch(onError, "Received non-object patch payload; skipping message");
        return { status: "skip" };
    }

    const missingFields = resolveMissingPatchFields(incoming as Record<string, unknown>);
    if (missingFields.length > 0) {
        const missingList = missingFields.join(", ");
        reportMalformedPatch(
            onError,
            `Patch payload missing required field${missingFields.length > 1 ? "s" : ""}: ${missingList}`
        );
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
    wrapper: PatchApplicator,
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

function handleSafeApplyException(error: unknown, patch: Patch, onError?: WebSocketClientOptions["onError"]): boolean {
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
    wrapper: PatchApplicator,
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
    const ctor = (globalThis as { WebSocket?: RuntimeWebSocketConstructor }).WebSocket;
    if (!ctor) {
        throw new Error("WebSocket global is not available");
    }

    return ctor;
}

function toRuntimePatchError(error: unknown, patch?: Patch): RuntimePatchError {
    const message = resolveRuntimeErrorMessage(error);
    return createRuntimePatchError(message, patch);
}

function createRuntimePatchError(message: string, patch?: Patch): RuntimePatchError {
    const runtimeError = new Error(message) as RuntimePatchError;
    runtimeError.patch = patch;
    return runtimeError;
}

function resolveRuntimeErrorMessage(error: unknown): string {
    if (Core.isErrorLike(error)) {
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

function resolveMissingPatchFields(candidate: Record<string, unknown>): Array<"kind" | "id"> {
    const missing: Array<"kind" | "id"> = [];

    if (!("kind" in candidate)) {
        missing.push("kind");
    }

    if (!("id" in candidate)) {
        missing.push("id");
    }

    return missing;
}

function reportMalformedPatch(onError: WebSocketClientOptions["onError"] | undefined, message: string): void {
    if (!onError) {
        return;
    }

    const error = createRuntimePatchError(message);
    onError(error, "patch");
}
