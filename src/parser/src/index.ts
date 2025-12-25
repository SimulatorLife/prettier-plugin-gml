import * as GMLParserModule from "./gml-parser.js";
import * as AST from "./ast/index.js";
import * as Runtime from "./runtime/index.js";
import * as Utils from "./utils/index.js"; // TODO: We need a more specific/meaningful name for this module. If it is too generic to be meaningfully named, it probably needs to be broken up.

// Re-export stable facade for generated parser base classes. External consumers
// should depend on these factory functions rather than importing from the
// generated directory directly, keeping coupling isolated to the abstraction layer.
export const GameMakerLanguageParserListenerBase =
    Runtime.getParserListenerBase();
export const GameMakerLanguageParserVisitorBase =
    Runtime.getParserVisitorBase();

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
export type { ParserOptions, ScopeTracker } from "./types/parser-types.js";
