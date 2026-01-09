import type { PatchApplicator, RuntimePatchError } from "../runtime/types.js";

export type WebSocketEvent = "open" | "message" | "close" | "error";

export interface MessageEventLike {
    data: unknown;
}

export interface RuntimeWebSocketInstance {
    addEventListener(event: WebSocketEvent, handler: (event?: MessageEventLike | Error) => void): void;
    removeEventListener(event: WebSocketEvent, handler: (event?: MessageEventLike | Error) => void): void;
    send(data: string): void;
    close(): void;
}

export type RuntimeWebSocketConstructor = new (url: string) => RuntimeWebSocketInstance;

export interface PatchQueueOptions {
    maxQueueSize?: number;
    flushIntervalMs?: number;
    enabled?: boolean;
}

export interface WebSocketClientOptions {
    url?: string;
    wrapper?: PatchApplicator | null;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: RuntimePatchError, phase: "connection" | "patch") => void;
    reconnectDelay?: number;
    autoConnect?: boolean;
    patchQueue?: PatchQueueOptions;
}

export interface PatchQueueState {
    queue: Array<unknown>;
    flushTimer: ReturnType<typeof setTimeout> | null;
    queueMetrics: PatchQueueMetrics;
}

export interface WebSocketClientState {
    ws: RuntimeWebSocketInstance | null;
    isConnected: boolean;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
    manuallyDisconnected: boolean;
    connectionMetrics: WebSocketConnectionMetrics;
    patchQueue: PatchQueueState | null;
}

export interface PatchQueueMetrics {
    totalQueued: number;
    totalFlushed: number;
    totalDropped: number;
    maxQueueDepth: number;
    flushCount: number;
    lastFlushSize: number;
    lastFlushedAt: number | null;
}

export interface WebSocketConnectionMetrics {
    totalConnections: number;
    totalDisconnections: number;
    totalReconnectAttempts: number;
    patchesReceived: number;
    patchesApplied: number;
    patchesFailed: number;
    lastConnectedAt: number | null;
    lastDisconnectedAt: number | null;
    lastPatchReceivedAt: number | null;
    lastPatchAppliedAt: number | null;
    connectionErrors: number;
    patchErrors: number;
}

export interface RuntimeWebSocketClient {
    connect(): void;
    disconnect(): void;
    isConnected(): boolean;
    /**
     * Sends arbitrary data that is stringified when necessary.
     */
    send(data: unknown): void;
    getWebSocket(): RuntimeWebSocketInstance | null;
    /**
     * Returns connection health metrics for diagnostics and monitoring.
     */
    getConnectionMetrics(): Readonly<WebSocketConnectionMetrics>;
    /**
     * Resets all connection metrics to their initial state.
     * Useful for starting fresh metric collection in long-running sessions
     * or for testing scenarios that require clean metric baselines.
     */
    resetConnectionMetrics(): void;
    /**
     * Returns patch queue metrics if queuing is enabled, null otherwise.
     * These metrics track queuing behavior for diagnostic and tuning purposes.
     */
    getPatchQueueMetrics(): Readonly<PatchQueueMetrics> | null;
    /**
     * Manually flushes any queued patches immediately.
     * Only applicable when patch queuing is enabled.
     * Returns the number of patches flushed.
     */
    flushPatchQueue(): number;
}
