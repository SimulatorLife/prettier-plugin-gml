import * as Modules from "./src/index.js";

export const RuntimeWrapper = Object.freeze({
    ...Modules.Runtime,
    ...Modules.Clients
});

export type {
    ApplyPatchResult,
    ErrorAnalytics,
    GeneralLogger,
    Logger,
    LoggerConfiguration,
    LoggerOptions,
    LogLevel,
    Patch,
    PatchErrorAnalytics,
    PatchErrorCategory,
    PatchErrorOccurrence,
    PatchErrorSummary,
    PatchHistoryEntry,
    PatchKind,
    PatchLifecycleLogger,
    PatchStats,
    RegistryLifecycleLogger,
    RuntimeFunction,
    RuntimePatchError,
    RuntimeRegistry,
    RuntimeRegistrySnapshot,
    RuntimeRegistryOverrides,
    RuntimeWrapper as RuntimeWrapperApi,
    RuntimeWrapperOptions,
    RuntimeWrapperState,
    TrySafeApplyResult,
    WebSocketLogger,
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
} from "./src/index.js";
