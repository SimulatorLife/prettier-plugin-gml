// Compatibility re-exports so code that expects `src/core/src/*` can find
// the parser-local `shared` helpers while we finish the migration.
// Expose the core package's utilities, AST helpers and resources. During the
// migration callers should prefer importing directly from `src/core/src/*`.
export * from "./utils/index.js";
export * from "./ast/locations.js";
export * from "./ast/node-helpers.js";
export * from "./ast/comments.js";
export * from "./ast/location-keys.js";
export * from "./resources/feather-metadata.js";
export * from "./resources/gml-identifiers.js";
export * from "./fs/index.js";
export * from "./reporting/index.js";
export * from "./deprecated-builtin-variable-replacements.js";
export * from "./feather-type-system.js";
export * from "./identifier-metadata/index.js";

// Namespaced exports expose the structured, forward-looking API surface
// expected by callers (for example `Core.AST` or `Core.Utils`). Retain the
// flat compatibility exports above so existing imports continue to work
// while packages migrate to the namespaced contract.
export * as AST from "./ast/index.js";
export * as Utils from "./utils/index.js";
export * as Resources from "./resources/index.js";
export * as IdentifierMetadata from "./identifier-metadata/index.js";
export * as FS from "./fs/index.js";
export * as Reporting from "./reporting/index.js";
export * as FeatherTypeSystem from "./feather-type-system.js";
export * as DeprecatedBuiltinVariables from "./deprecated-builtin-variable-replacements.js";
