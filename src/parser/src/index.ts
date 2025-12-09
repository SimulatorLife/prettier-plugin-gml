import * as GMLParserModule from "./gml-parser.js";
import * as AST from "./ast/index.js";
import * as Runtime from "./runtime/index.js";
import * as Utils from "./utils/index.js"; // TODO: We need a more specific/meaningful name for this module. If it is too generic to be meaningfully named, it probably needs to be broken up.

export { default as GameMakerLanguageParserListenerBase } from "../generated/GameMakerLanguageParserListener.js";
export { default as GameMakerLanguageParserVisitorBase } from "../generated/GameMakerLanguageParserVisitor.js";

// Define the Parser namespace type from existing module types
type ParserNamespace = typeof GMLParserModule &
    typeof AST &
    typeof Runtime &
    typeof Utils & {
        AST: typeof AST;
        Runtime: typeof Runtime;
        Utils: typeof Utils;
    };

// Export the flattened Parser namespace
// TODO: Should probably only export the GMLParser class itself here, not its internals
export const Parser: ParserNamespace = Object.freeze({
    ...GMLParserModule,
    ...AST,
    ...Runtime,
    ...Utils,
    AST,
    Runtime,
    Utils
});

// Export types from the parser for consumer packages to import without deep
// imports. This mirrors `Core`'s exported types and keeps package roots
// stable for other workspaces.
export type { ParserOptions } from "./types/parser-types.js";
