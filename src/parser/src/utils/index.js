// Utilities
// Re-export commonly-used helpers from the core package so existing parser
// modules that import named utilities from "./utils/index.js" keep working
// without changing every import site. Also preserve parser-local utility
// re-exports.
export * from "@gml-modules/core";
export * from "./syntax-error-guards.js";
export * from "./estree-converter.js";
//# sourceMappingURL=index.js.map