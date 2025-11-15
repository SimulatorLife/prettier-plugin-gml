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
export * from "./parser/index.js";
export * from "./reporting/index.js";
export * from "./deprecated-builtin-variable-replacements.js";

// Temporary re-exports of parser-local helpers that haven't been ported into
// core yet. These unblock consumers during the migration and will be removed
// once the canonical implementations are moved into `src/core/src`.
// Re-export small helpers directly from the parser-local implementations
// while the full migration completes. These are intentionally short-lived
// compatibility exports and will be moved into `src/core/src` permanently
// in a follow-up cleanup.
