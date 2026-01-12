// Re-export the Core namespace for tests and callers that import it from the
// CLI shared entrypoint. This keeps the existing grouped exports working
// while providing access to the upstream Core namespace.
export { Core } from "@gml-modules/core";

export * from "./ensure-dir.js";
export * from "./error-guards.js";
export * from "./fs-artifacts.js";
export * from "./module.js";
export * from "./package-resolution.js";
export * from "./workspace-paths.js";
export * as Reporting from "./reporting/index.js";
