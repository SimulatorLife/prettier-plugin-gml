// Explicitly export identifier-case public API to avoid duplicate symbol
// collisions that can occur when re-exporting internal modules. Consumers
// should import the public helpers from this surface only.
export { maybeReportIdentifierCaseDryRun } from "./identifier-case/identifier-case-report.js";
export {
    getIdentifierCaseRenameForNode,
    captureIdentifierCasePlanSnapshot,
    applyIdentifierCasePlanSnapshot
} from "./identifier-case/plan-service.js";
export { teardownIdentifierCaseEnvironment } from "./identifier-case/environment.js";
export { attachIdentifierCasePlanSnapshot } from "./identifier-case/environment.js";
export { prepareIdentifierCaseEnvironment } from "./identifier-case/environment.js";
export {
    identifierCaseOptions,
    normalizeIdentifierCaseOptions
} from "./identifier-case/options.js";

export * from "./project-index/index.js";
export * from "./scopes/index.js";
export * from "./resources/bundled-resources.js";
export * from "./resources/reserved-identifiers.js";
