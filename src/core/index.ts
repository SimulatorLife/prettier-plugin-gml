// Expose the Core namespace as the sole public surface
export { Core, createParserTransform } from "./src/index.js";

// Re-export key types for consumer usage
export type {
    AbortSignalLike,
    DebouncedFunction,
    DocCommentLines,
    DocCommentNodeMetadata,
    EmptyTransformOptions,
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
    ScopeLifecycle,
    ScopeTracker,
    ScopeTrackerOptions,
    StringCommentScanState,
    StripCommentsTransformOptions
} from "./src/index.js";
