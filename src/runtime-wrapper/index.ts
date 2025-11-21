import * as Modules from "./src/index.js";

export const RuntimeWrapper = Object.freeze({
    ...Modules.Runtime,
    ...Modules.Clients
});

export type {
    ApplyPatchResult,
    Patch,
    PatchHistoryEntry,
    PatchKind,
    PatchStats,
    RuntimeFunction,
    RuntimePatchError,
    RuntimeRegistry,
    RuntimeRegistrySnapshot,
    RuntimeRegistryOverrides,
    RuntimeWrapper as RuntimeWrapperApi,
    RuntimeWrapperOptions,
    RuntimeWrapperState,
    TrySafeApplyResult,
    MessageEventLike,
    RuntimeWebSocketClient,
    RuntimeWebSocketConstructor,
    RuntimeWebSocketInstance,
    WebSocketEvent,
    WebSocketClientOptions,
    WebSocketClientState
} from "./src/index.js";
