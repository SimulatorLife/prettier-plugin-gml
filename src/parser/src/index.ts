import * as GMLParser from "./gml-parser.js";
export { default as GameMakerLanguageParserListenerBase } from "../generated/GameMakerLanguageParserListener.js";
export { default as GameMakerLanguageParserVisitorBase } from "../generated/GameMakerLanguageParserVisitor.js";
import * as AST from "./ast/index.js";
import * as Comments from "./comments/index.js";
import * as Options from "./options/index.js";
import * as Runtime from "./runtime/index.js";
import * as Transforms from "./transforms/index.js";
import * as Utils from "./utils/index.js";

// Define the Parser namespace type from existing module types
type ParserNamespace = typeof GMLParser &
    typeof AST &
    typeof Comments &
    typeof Options &
    typeof Runtime &
    typeof Transforms &
    typeof Utils & {
        AST: typeof AST;
        Comments: typeof Comments;
        Options: typeof Options;
        Runtime: typeof Runtime;
        Transforms: typeof Transforms;
        Utils: typeof Utils;
    };

// Export the flattened Parser namespace
// TODO: Should probably only export the GMLParser class itself here, not its internals
export const Parser: ParserNamespace = Object.freeze({
    ...GMLParser,
    ...AST,
    ...Comments,
    ...Options,
    ...Runtime,
    ...Transforms,
    ...Utils,
    AST,
    Comments,
    Options,
    Runtime,
    Transforms,
    Utils
});

// Export types from the parser for consumer packages to import without deep
// imports. This mirrors `Core`'s exported types and keeps package roots
// stable for other workspaces.
export type { ParserOptions } from "./types/parser-types.js";
