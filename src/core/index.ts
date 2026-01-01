// Expose the Core namespace as the sole public surface
export { Core } from "./src/index.js";

// Re-export key types for consumer usage
export type {
    GameMakerAstLocation,
    GameMakerAstNode,
    MutableGameMakerAstNode,
    DocCommentLines,
    MutableDocCommentLines,
    AbortSignalLike
} from "./src/index.js";
