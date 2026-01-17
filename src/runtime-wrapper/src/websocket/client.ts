import { isErrorLike, toArray } from "../runtime/runtime-core-helpers.js";
import { validatePatch } from "../runtime/patch-utils.js";
import type { Patch, PatchApplicator, RuntimePatchError, TrySafeApplyResult } from "../runtime/types.js";
import type { Logger } from "../runtime/logger.js";
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
const READINESS_POLL_INTERVAL_MS = 50;

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

type FlushQueueOptions = {
    state: WebSocketClientState;
    wrapper: PatchApplicator | null;
    applyIncomingPatch: (incoming: unknown) => boolean;
    logger?: Logger;
};

function flushQueuedPatchesInternal(options: FlushQueueOptions): number {
    const { state, wrapper, applyIncomingPatch, logger } = options;

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

    const flushStartTime = Date.now();

    if (wrapper.applyPatchBatch) {
        const result = wrapper.applyPatchBatch(patchesToFlush);
        const applied = result.success && !result.rolledBack ? result.appliedCount : 0;
        const failed = result.success ? 0 : flushSize;

        state.connectionMetrics.patchesApplied += applied;
        state.connectionMetrics.patchesFailed += failed;
        if (failed > 0) {
            state.connectionMetrics.patchErrors += failed;
        }
        queueState.queueMetrics.totalFlushed += flushSize;

        if (result.success && applied > 0) {
            state.connectionMetrics.lastPatchAppliedAt = Date.now();
        }
    } else {
        for (const patch of patchesToFlush) {
            applyIncomingPatch(patch);
        }
        queueState.queueMetrics.totalFlushed += flushSize;
    }

    const flushDuration = Date.now() - flushStartTime;
    if (logger) {
        logger.patchQueueFlushed(flushSize, flushDuration);
    }

    return flushSize;
}

type EnqueuePatchOptions = {
    patch: unknown;
    state: WebSocketClientState;
    maxQueueSize: number;
    flushQueuedPatches: () => number;
    scheduleFlush: () => void;
    logger?: Logger;
};

function enqueuePatchInternal(options: EnqueuePatchOptions): void {
    const { patch, state, maxQueueSize, flushQueuedPatches, scheduleFlush, logger } = options;

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

    if (logger && typeof patch === "object" && patch !== null && "id" in patch && typeof patch.id === "string") {
        logger.patchQueued(patch.id, currentDepth);
    }

    if (currentDepth >= maxQueueSize) {
        flushQueuedPatches();
    } else {
        scheduleFlush();
    }
}

type ApplyIncomingPatchOptions = {
    incoming: unknown;
    state: WebSocketClientState;
    wrapper: PatchApplicator | null;
    onError?: WebSocketClientOptions["onError"];
    logger?: Logger;
};

function applyIncomingPatchInternal(options: ApplyIncomingPatchOptions): boolean {
    const { incoming, state, wrapper, onError, logger } = options;

    const receivedAt = Date.now();
    state.connectionMetrics.patchesReceived += 1;
    state.connectionMetrics.lastPatchReceivedAt = receivedAt;

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

    if (
        logger &&
        patch.metadata?.timestamp &&
        typeof patch.metadata.timestamp === "number" &&
        patch.metadata.timestamp > 0
    ) {
        const transportLatency = receivedAt - patch.metadata.timestamp;
        logger.debug(
            `Patch ${patch.id} transport latency: ${transportLatency}ms (generated at ${new Date(patch.metadata.timestamp).toISOString()})`
        );
    }

    const recordSuccess = (applyDuration: number) => {
        state.connectionMetrics.patchesApplied += 1;
        state.connectionMetrics.lastPatchAppliedAt = Date.now();
        if (logger) {
            logger.info(`Patch ${patch.id} applied in ${applyDuration}ms`);
        }
    };

    const recordFailure = () => {
        state.connectionMetrics.patchesFailed += 1;
        state.connectionMetrics.patchErrors += 1;
    };

    if (wrapper && wrapper.trySafeApply) {
        const appliedStartAt = Date.now();
        const applied = applyPatchSafely(patch, wrapper, onError);
        if (applied) {
            recordSuccess(Date.now() - appliedStartAt);
        } else {
            recordFailure();
        }
        return applied;
    }

    if (wrapper) {
        const appliedStartAt = Date.now();
        const applied = applyPatchDirectly(patch, wrapper, onError);
        if (applied) {
            recordSuccess(Date.now() - appliedStartAt);
        } else {
            recordFailure();
        }
        return applied;
    }

    return true;
}

export function createWebSocketClient({
    url = "ws://127.0.0.1:17890",
    wrapper = null,
    onConnect,
    onDisconnect,
    onError,
    reconnectDelay = 800,
    autoConnect = true,
    patchQueue,
    logger
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
        patchQueue: queueEnabled ? createPatchQueueState() : null,
        pendingPatches: [],
        readinessTimer: null
    };

    const runtimeReady = (): boolean => {
        const globals = globalThis as Record<string, unknown>;
        const builtins = globals?.g_pBuiltIn;
        return typeof builtins === "object" && builtins !== null;
    };

    const clearReadinessTimer = (): void => {
        if (state.readinessTimer !== null) {
            clearInterval(state.readinessTimer);
            state.readinessTimer = null;
        }
    };

    const flushPendingPatches = (): void => {
        if (!runtimeReady()) {
            return;
        }

        while (state.pendingPatches.length > 0) {
            const patch = state.pendingPatches.shift();
            if (patch !== undefined) {
                applyIncomingPatch(patch);
            }
        }

        clearReadinessTimer();
    };

    const ensureReadinessTimer = (): void => {
        if (state.readinessTimer !== null) {
            return;
        }

        state.readinessTimer = setInterval(() => {
            if (runtimeReady()) {
                flushPendingPatches();
            }
        }, READINESS_POLL_INTERVAL_MS);
    };

    const queuePendingPatch = (patch: unknown): void => {
        state.pendingPatches.push(patch);
        ensureReadinessTimer();
    };

    const flushQueuedPatches = (): number => {
        return flushQueuedPatchesInternal({
            state,
            wrapper,
            applyIncomingPatch,
            logger
        });
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
        enqueuePatchInternal({
            patch,
            state,
            maxQueueSize,
            flushQueuedPatches,
            scheduleFlush,
            logger
        });
    };

    const applyIncomingPatch = (incoming: unknown): boolean => {
        if (!runtimeReady()) {
            queuePendingPatch(incoming);
            return false;
        }

        return applyIncomingPatchInternal({
            incoming,
            state,
            wrapper,
            onError,
            logger
        });
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
                connect,
                logger,
                url
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
        state.pendingPatches.length = 0;
        clearReadinessTimer();
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
    logger?: Logger;
    url: string;
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
    logger?: Logger;
};

type WebSocketErrorHandlerArgs = {
    state: WebSocketClientState;
    onError?: WebSocketClientOptions["onError"];
    logger?: Logger;
};

function attachWebSocketEventListeners(ws: RuntimeWebSocketInstance, args: WebSocketEventListenerArgs): void {
    ws.addEventListener("open", createOpenHandler(args.state, args.onConnect, args.logger, args.url));
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
            connect: args.connect,
            logger: args.logger
        })
    );
    ws.addEventListener(
        "error",
        createErrorHandler({
            state: args.state,
            onError: args.onError,
            logger: args.logger
        })
    );
}

function createOpenHandler(
    state: WebSocketClientState,
    onConnect?: WebSocketClientOptions["onConnect"],
    logger?: Logger,
    url?: string
): () => void {
    return () => {
        const websocketState = state;
        websocketState.isConnected = true;
        websocketState.connectionMetrics.totalConnections += 1;
        websocketState.connectionMetrics.lastConnectedAt = Date.now();

        if (websocketState.reconnectTimer) {
            clearTimeout(websocketState.reconnectTimer);
            websocketState.reconnectTimer = null;
        }

        if (logger && url) {
            logger.websocketConnected(url);
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

        const patches = toArray(payload);

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

function createCloseHandler({
    state,
    onDisconnect,
    reconnectDelay,
    connect,
    logger
}: WebSocketCloseHandlerArgs): () => void {
    return () => {
        const websocketState = state;
        websocketState.isConnected = false;
        websocketState.ws = null;
        websocketState.connectionMetrics.totalDisconnections += 1;
        websocketState.connectionMetrics.lastDisconnectedAt = Date.now();

        if (logger) {
            logger.websocketDisconnected();
        }

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
            if (logger) {
                logger.websocketReconnecting(websocketState.connectionMetrics.totalReconnectAttempts, reconnectDelay);
            }
            websocketState.reconnectTimer = setTimeout(() => {
                connect();
            }, reconnectDelay);
        }
    };
}

function createErrorHandler({ state, onError, logger }: WebSocketErrorHandlerArgs): (event?: Error) => void {
    return (event?: Error) => {
        const websocketState = state;
        websocketState.connectionMetrics.connectionErrors += 1;

        const errorMessage = isErrorLike(event) ? event.message : "Unknown WebSocket error";

        if (logger) {
            logger.websocketError(errorMessage);
        }

        if (websocketState.ws) {
            websocketState.ws.close();
        }

        if (onError) {
            const safeError = createRuntimePatchError(errorMessage);
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

type HotReloadErrorNotification = {
    kind: "error";
    error: string;
    filePath?: string;
    timestamp?: number;
};

function isHotReloadErrorNotification(payload: Record<string, unknown>): payload is HotReloadErrorNotification {
    if (payload.kind !== "error") {
        return false;
    }

    return typeof payload.error === "string" && payload.error.length > 0;
}

function reportHotReloadErrorNotification(
    payload: HotReloadErrorNotification,
    onError?: WebSocketClientOptions["onError"]
): void {
    if (!onError) {
        return;
    }

    const fileDescriptor = payload.filePath ? ` in ${payload.filePath}` : "";
    const message = `Hot reload error${fileDescriptor}: ${payload.error}`;
    const error = createRuntimePatchError(message);
    onError(error, "patch");
}

function validatePatchCandidate(incoming: unknown, onError?: WebSocketClientOptions["onError"]): PatchValidationResult {
    if (!incoming || typeof incoming !== "object") {
        reportMalformedPatch(onError, "Received non-object patch payload; skipping message");
        return { status: "skip" };
    }

    if (isHotReloadErrorNotification(incoming as Record<string, unknown>)) {
        reportHotReloadErrorNotification(incoming as HotReloadErrorNotification, onError);
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
    if (isErrorLike(error)) {
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
