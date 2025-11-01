// Re-export the curated dependency surface alongside plugin-specific helpers so
// consumers interact with the minimal shared API required by the formatter.
export * from "./dependencies.js";
export { createResolverController } from "./resolver-controller.js";
