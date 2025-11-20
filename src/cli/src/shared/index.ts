// Re-export the Core namespace for tests and callers that import it from the
// CLI shared entrypoint. This keeps the existing grouped exports working
// while providing access to the upstream Core namespace.
export { Core } from "@gml-modules/core";

export * from "../dependencies.js";
export * from "./module.js";
export * from "./workspace-paths.js";
