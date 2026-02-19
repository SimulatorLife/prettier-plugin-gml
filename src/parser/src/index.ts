import * as AST from "./ast/index.js";
import * as GMLParserModule from "./gml-parser.js";
import * as Runtime from "./runtime/index.js";

// Re-export stable facade for generated parser base classes. External consumers
// should depend on these factory functions rather than importing from the
// generated directory directly, keeping coupling isolated to the abstraction layer.
export const GameMakerLanguageParserListenerBase = Runtime.getParserListenerBase();
export const GameMakerLanguageParserVisitorBase = Runtime.getParserVisitorBase();

// Define the Parser namespace type from existing module types
type ParserNamespace = typeof GMLParserModule &
    typeof AST &
    typeof Runtime & {
        AST: typeof AST;
        Runtime: typeof Runtime;
    };

// Export the flattened Parser namespace for external consumers.
//
// DESIGN QUESTION: Should the public API expose the entire Parser namespace
// (GMLParser, AST, Runtime) or only the GMLParser class itself?
//
// CURRENT STATE: The Parser namespace re-exports everything from the parser
// package, creating a wide public API surface. This gives consumers access to
// internal utilities and AST builder functions that may not be intended for
// external use.
//
// ALTERNATIVE: Export only the GMLParser class and a minimal set of necessary
// types/interfaces. Internal modules (AST, Runtime) would remain private
// to the parser package. Consumers would import `{ GMLParser }` and use its
// public `parse()` method, treating everything else as implementation details.
//
// TRADE-OFFS:
// - Wide API (current): Flexible but exposes internals, harder to maintain backward
//   compatibility, encourages tight coupling to parser implementation details.
// - Narrow API (alternative): Cleaner boundaries, easier to refactor internals,
//   but may require adding explicit exports if consumers have legitimate needs.
//
// RECOMMENDATION: Audit current usage of Parser.AST, Parser.Runtime
// in the codebase. If they're only used internally or by tightly-coupled packages
// (e.g., plugin, semantic), narrow the API and provide explicit exports for the
// few necessary pieces. If they're widely used by external consumers, document
// the intended usage and mark internal-only exports as such.
export const Parser: ParserNamespace = Object.freeze({
    ...GMLParserModule,
    ...AST,
    ...Runtime,
    AST,
    Runtime
});

// Export types from the parser for consumer packages to import without deep
// imports. This mirrors `Core`'s exported types and keeps package roots
// stable for other workspaces.
export type { ParserOptions, ScopeTracker } from "./types/parser-types.js";
