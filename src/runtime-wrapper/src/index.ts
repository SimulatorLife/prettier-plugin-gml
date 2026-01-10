import * as Runtime from "./runtime/index.js";
import * as Clients from "./websocket/index.js";

export const RuntimeWrapper = Object.freeze({
    ...Runtime,
    ...Clients
});

export type {
    ApplyPatchResult,
    BatchApplyResult,
    ErrorAnalytics,
    HistoryManager,
    Patch,
    PatchApplicator,
    PatchDiagnostics,
    PatchErrorAnalytics,
    PatchErrorCategory,
    PatchErrorOccurrence,
    PatchErrorSummary,
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
    TrySafeApplyResult,
    Logger,
    LoggerOptions,
    LogLevel
} from "./runtime/index.js";
export type {
    MessageEventLike,
    PatchQueueMetrics,
    PatchQueueOptions,
    PatchQueueState,
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
