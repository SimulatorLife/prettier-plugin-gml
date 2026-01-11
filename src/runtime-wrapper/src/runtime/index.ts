export { createRuntimeWrapper } from "./runtime-wrapper.js";
export { testPatchInShadow } from "./patch-utils.js";
export { resolveBuiltinConstants } from "./builtin-constants.js";
export { createLogger, createChangeEventLogger } from "./logger.js";
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
    RuntimeWrapper,
    RuntimeWrapperOptions,
    RuntimeWrapperState,
    TrySafeApplyResult
} from "./types.js";
export type {
    Logger,
    LoggerOptions,
    LogLevel,
    PatchLifecycleLogger,
    RegistryLifecycleLogger,
    WebSocketLogger,
    GeneralLogger,
    LoggerConfiguration
} from "./logger.js";
