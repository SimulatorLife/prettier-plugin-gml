// Expose the Core namespace as the sole public surface
// Also re-export relevant types for consumer usage
export { Core } from "./src/index.js";
export type {
    FeatherFixDetail,
    FeatherFixRange,
    GameMakerAstLocation,
    GameMakerAstNode,
    MutableGameMakerAstNode
    // TODO: This may not be a comprehensive list of types to export
} from "./src/index.js";
