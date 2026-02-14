// Expose the Core namespace as the sole public surface
export { Core } from "./src/index.js";

// Re-export key types for consumer usage
export type {
    AbortSignalLike,
    DebouncedFunction,
    DocCommentLines,
    GameMakerAstLocation,
    GameMakerAstNode,
    GlobalIdentifierTracker,
    IdentifierRoleManager,
    LiteralNode,
    MutableDocCommentLines,
    MutableGameMakerAstNode,
    ScopeLifecycle,
    ScopeTracker,
    ScopeTrackerOptions,
    StringCommentScanState
} from "./src/index.js";
