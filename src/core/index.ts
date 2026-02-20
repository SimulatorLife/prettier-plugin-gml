// Expose the Core namespace as the sole public surface
export { Core, createParserTransform, DescriptionUtils, NormalizationUtils } from "./src/index.js";

// Re-export key types for consumer usage
export type {
    AbortSignalLike,
    DebouncedFunction,
    DocCommentLines,
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
    StringCommentScanState
} from "./src/index.js";
