export * as AST from "./ast/index.js";
export * as FS from "./fs/index.js";
export * as Reporting from "./reporting/index.js";
export * as Utils from "./utils/index.js";
export * as Resources from "./resources/index.js";
export * as IdentifierMetadata from "./resources/identifier-metadata.js";
export * as DeprecatedBuiltinVariables from "./utils/deprecated-builtin-variable-replacements.js";

// Also expose commonly-consumed helpers at the package-flat (named) level so
// callers that destructure utility functions from the package root (e.g.
// `import { isNonEmptyString } from "@gml-modules/core"`) continue to work.
// This flattens selected submodule exports into the top-level export surface.
export * from "./utils/index.js";
// Also expose filesystem helpers (path conversions, ancestor walking) at the
// package-flat level. Some consumers destructure `fromPosixPath` directly from
// the `Core` namespace, so re-exporting the FS path helpers preserves that
// historical surface while keeping the FS namespace available as `Core.FS`.
export * from "./fs/index.js";
export * from "./ast/index.js";
// Also expose selected reporting helpers at the package-flat level so callers
// that previously destructured reporting helpers from the package root
// (e.g. `import { createMetricsTracker } from "@gml-modules/core"`) still
// work without updating all call sites immediately.
export * from "./reporting/index.js";
