import type {
    Patch,
    RuntimePatchError,
    RuntimeWrapper
} from "../runtime/types.js";

export type WebSocketEvent = "open" | "message" | "close" | "error";

export interface MessageEventLike {
    data: string;
}

export interface RuntimeWebSocketInstance {
    addEventListener(
        event: WebSocketEvent,
        handler: (event?: MessageEventLike | Error) => void
    ): void;
    removeEventListener(
        event: WebSocketEvent,
        handler: (event?: MessageEventLike | Error) => void
    ): void;
    send(data: string): void;
    close(): void;
}

export type RuntimeWebSocketConstructor = new (
    url: string
) => RuntimeWebSocketInstance;

export interface WebSocketClientOptions {
    url?: string;
    wrapper?: RuntimeWrapper | null;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: RuntimePatchError, phase: "connection" | "patch") => void;
    reconnectDelay?: number;
    autoConnect?: boolean;
}

export interface WebSocketClientState {
    ws: RuntimeWebSocketInstance | null;
    isConnected: boolean;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
    manuallyDisconnected: boolean;
}

export interface RuntimeWebSocketClient {
    connect(): void;
    disconnect(): void;
    isConnected(): boolean;
    send(data: string | unknown): void;
    getWebSocket(): RuntimeWebSocketInstance | null;
}
