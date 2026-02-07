// Import all domain modules with namespace prefixes to organize the public API
import * as IdentifierCase from "./identifier-case/index.js";
import * as ProjectIndex from "./project-index/index.js";
import * as ProjectMetadata from "./project-metadata/index.js";
import * as Scopes from "./scopes/index.js";
import * as Symbols from "./symbols/index.js";

// Define the Semantic namespace type from existing module types
type SemanticNamespace = typeof IdentifierCase &
    typeof ProjectMetadata &
    typeof ProjectIndex &
    typeof Scopes &
    typeof Symbols & {
        // Preserve nested namespace access for consumers who want explicit grouping
        IdentifierCase: typeof IdentifierCase;
        ProjectMetadata: typeof ProjectMetadata;
        ProjectIndex: typeof ProjectIndex;
        Scopes: typeof Scopes;
        Symbols: typeof Symbols;
    };

// Export the flattened Semantic namespace with nested namespace access
// This follows the same pattern as Core: flat access for common usage,
// nested namespaces available for explicit grouping when needed
export const Semantic: SemanticNamespace = Object.freeze({
    ...IdentifierCase,
    ...ProjectMetadata,
    ...ProjectIndex,
    ...Scopes,
    ...Symbols,
    IdentifierCase,
    ProjectMetadata,
    ProjectIndex,
    Scopes,
    Symbols
});
