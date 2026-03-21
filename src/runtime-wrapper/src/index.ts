import * as Runtime from "./runtime/index.js";
import { getHighResolutionTime, getWallClockTime, measureDuration } from "./timing-utils.js";
import * as Clients from "./websocket/index.js";

// Export the RuntimeWrapper namespace as the primary public API
export const RuntimeWrapper = Object.freeze({
    ...Runtime,
    ...Clients,
    getHighResolutionTime,
    getWallClockTime,
    measureDuration
});

export type {
    ApplyPatchResult,
    BatchApplyResult,
    ErrorAnalytics,
    GeneralLogger,
    Logger,
    LoggerConfiguration,
    LoggerOptions,
    LogLevel,
    Patch,
    PatchApplicator,
    PatchDiagnostics,
    PatchErrorAnalytics,
    PatchErrorCategory,
    PatchErrorOccurrence,
    PatchErrorSummary,
    PatchHistoryEntry,
    PatchHistoryReader,
    PatchKind,
    PatchLifecycleLogger,
    PatchMetadata,
    PatchStats,
    PatchUndoController,
    RegistryChangeEvent,
    RegistryChangeListener,
    RegistryDiagnostics,
    RegistryHealthCheck,
    RegistryHealthIssue,
    RegistryLifecycleLogger,
    RegistryMutator,
    RegistryReader,
    RuntimeFunction,
    RuntimeMetrics,
    RuntimePatchError,
    RuntimeRegistry,
    RuntimeRegistryOverrides,
    RuntimeRegistrySnapshot,
    RuntimeWrapperOptions,
    RuntimeWrapperState,
    RuntimeWrapper as RuntimeWrapperType,
    TrySafeApplyResult,
    WebSocketLogger
} from "./runtime/index.js";
// Export sub-namespaces for internal use and testing
export * as Runtime from "./runtime/index.js";
export type {
    MessageEventLike,
    PatchQueueMetrics,
    PatchQueueOptions,
    PatchQueueState,
    RuntimeWebSocketClient,
    RuntimeWebSocketConstructor,
    RuntimeWebSocketInstance,
    WebSocketClientOptions,
    WebSocketClientState,
    WebSocketConnectionLifecycle,
    WebSocketConnectionMetrics,
    WebSocketEvent,
    WebSocketInstanceProvider,
    WebSocketMessageSender,
    WebSocketMetricsCollector,
    WebSocketPatchQueueManager
} from "./websocket/index.js";
export * as Clients from "./websocket/index.js";
// Timing utilities are workspace-level cross-cutting helpers used by both the
// runtime and websocket layers. They are exported directly from the workspace
// root so consumers do not need to depend on either sublayer to access them.
export { getHighResolutionTime, getWallClockTime, measureDuration } from "./timing-utils.js";
