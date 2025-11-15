// Historical parser-local shared surface. During the rearchitecture the
// canonical helpers moved into core; this file re-exports the expected
// symbols so existing parser tests and modules continue to resolve.

export { getLineBreakCount, splitLines } from "../utils/line-breaks.js";
export { getNodeStartIndex } from "../ast/locations.js";
// Re-export parser-local shared helpers so the parser package does not depend
// on the top-level shared package at runtime. As more helpers are ported from
// `src/shared/src`, add them here so transforms can import from `../shared`.

export * from "../utils/deprecated-builtin-variable-replacements.js";
export * from "../utils/feather-type-system.js";
export * from "../utils/resolver-controller.js";

// Utilities
export * from "./utils/array.js";
export * from "./utils/function.js";
export * from "./utils/object.js";
export * from "./utils/capability-probes.js";
export * from "./utils/number.js";
export * from "./utils/numeric-options.js";
export * from "./utils/regexp.js";
export * from "./utils/string.js";
export * from "./utils/line-breaks.js";

// AST helpers (ported locally)
export * from "../ast/locations.js";
export * from "../ast/node-helpers.js";
export * from "../ast/comments.js";


