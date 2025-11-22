// Expose the Core namespace as the sole public surface.
export { Core } from "./src/index.js";
export type {
    GameMakerAstLocation,
    GameMakerAstNode,
    MutableGameMakerAstNode
} from "./src/ast/types.js";
