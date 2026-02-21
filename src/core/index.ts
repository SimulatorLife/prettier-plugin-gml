// Expose the Core namespace as the sole public surface
export { Core } from "./src/index.js";

// Re-export key types for consumer usage
export type {
    AbortSignalLike,
    DebouncedFunction,
    DocCommentLines,
    FeatherDiagnostic,
    FeatherMetadata,
    GameMakerAstLocation,
    GameMakerAstNode,
    GlobalIdentifierTracker,
    IdentifierRoleManager,
    LiteralNode,
    MutableDocCommentLines,
    MutableGameMakerAstNode,
    ParserTransform,
    EmptyTransformOptions,
    ScopeLifecycle,
    ScopeTracker,
    ScopeTrackerOptions,
    StringCommentScanState,
    StripCommentsTransformOptions
} from "./src/index.js";
