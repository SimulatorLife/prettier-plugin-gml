// Expose the Core namespace as the sole public surface
export { Core } from "./src/index.js";

// Re-export key types for consumer usage
export type {
    AbortSignalLike,
    DebouncedFunction,
    DeprecatedIdentifierDiagnosticOwner,
    DeprecatedIdentifierLegacyUsage,
    DeprecatedIdentifierMetadataEntry,
    DeprecatedIdentifierReplacementKind,
    DocCommentLines,
    DocCommentNodeMetadata,
    EmptyTransformOptions,
    FeatherDiagnostic,
    FeatherMetadata,
    GameMakerAstLocation,
    GameMakerAstNode,
    GmloopProjectConfig,
    LiteralNode,
    MutableDocCommentLines,
    MutableGameMakerAstNode,
    ParserTransform,
    StringCommentScanState,
    StripCommentsTransformOptions
} from "./src/index.js";
