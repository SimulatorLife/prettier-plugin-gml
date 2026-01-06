import * as Runtime from "./runtime/index.js";
import * as Clients from "./websocket/index.js";

export const RuntimeWrapper = Object.freeze({
    ...Runtime,
    ...Clients
});

// Also export the nested namespaces for tests and internal consumers


export type {
    ApplyPatchResult,
    BatchApplyResult,
    HistoryManager,
    Patch,
    PatchApplicator,
    PatchDiagnostics,
    PatchHistoryEntry,
    PatchKind,
    PatchMetadata,
    PatchStats,
    RegistryChangeEvent,
    RegistryChangeListener,
    RegistryDiagnostics,
    RegistryHealthCheck,
    RegistryHealthIssue,
    RegistryMutator,
    RegistryReader,
    RuntimeFunction,
    RuntimeMetrics,
    RuntimePatchError,
    RuntimeRegistry,
    RuntimeRegistrySnapshot,
    RuntimeRegistryOverrides,
    RuntimeWrapper as RuntimeWrapperApi,
    RuntimeWrapperOptions,
    RuntimeWrapperState,
    TrySafeApplyResult
} from "./runtime/index.js";
export type {
    MessageEventLike,
    RuntimeWebSocketClient,
    RuntimeWebSocketConstructor,
    RuntimeWebSocketInstance,
    WebSocketEvent,
    WebSocketClientOptions,
    WebSocketClientState,
    WebSocketConnectionMetrics
} from "./websocket/index.js";

export * as Runtime from "./runtime/index.js";
export * as Clients from "./websocket/index.js";