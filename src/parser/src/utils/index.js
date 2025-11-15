// Re-export parser-local shared helpers so the parser package does not depend
// on the top-level shared package at runtime. As more helpers are ported from
// `src/shared/src`, add them here so transforms can import from `../shared`.

export * from "./deprecated-builtin-variable-replacements.js";
export * from "./feather-type-system.js";
export * from "./resolver-controller.js";

// Utilities
export * from "./array.js";
export * from "./function.js";
export * from "./object.js";
export * from "./capability-probes.js";
export * from "./number.js";
export * from "./numeric-options.js";
export * from "./regexp.js";
export * from "./string.js";
export * from "./line-breaks.js";

// AST helpers (ported locally)
export * from "../ast/locations.js";
export * from "../ast/node-helpers.js";
// NOTE: do not re-export the entire core package here — consumers should
// import `@gml-modules/core` directly to avoid duplicate export conflicts.
