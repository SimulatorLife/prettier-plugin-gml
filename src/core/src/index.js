export * as AST from "./ast/index.js";
export * from "./ast/index.js";
export * as FS from "./fs/index.js";
export * as Reporting from "./reporting/index.js";
// Also re-export reporting named helpers at the package root so legacy callers
// that destructure functions from `Core` (e.g. `const { createMetricsTracker } = Core;`)
// continue to work. These are pure exports (no runtime logic).
export * from "./reporting/index.js";
export * as Utils from "./utils/index.js";
// Also re-export utils' named helpers at the package root so legacy callers
// that destructure functions from `Core` (e.g. `Core.createEnvConfiguredValueWithFallback`)
// continue to work. These are pure exports (no runtime logic) and follow the
// project's public API composition pattern.
export * from "./utils/index.js";
export * as Resources from "./resources/index.js";
export * as IdentifierMetadata from "./resources/identifier-metadata.js";
export * as DeprecatedBuiltinVariables from "./utils/deprecated-builtin-variable-replacements.js";
