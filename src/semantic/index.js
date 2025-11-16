import * as _IdentifierCase from "./src/identifier-case/index.js";
import {
    getIdentifierCaseRenameForNode,
    captureIdentifierCasePlanSnapshot,
    applyIdentifierCasePlanSnapshot,
    maybeReportIdentifierCaseDryRun,
    teardownIdentifierCaseEnvironment
} from "./src/index.js";

// Build a stable, frozen IdentifierCase namespace that merges the richer
// internal identifier-case surface with a few explicitly exported helpers
// from the authoritative semantic source surface. This ensures consumers
// that destructure helpers (printer/tests) always see the expected symbols
// available at import time.
export const IdentifierCase = Object.freeze(
    Object.assign({}, _IdentifierCase, {
        getIdentifierCaseRenameForNode,
        captureIdentifierCasePlanSnapshot,
        applyIdentifierCasePlanSnapshot,
        maybeReportIdentifierCaseDryRun,
        teardownIdentifierCaseEnvironment
    })
);
export * as ProjectIndex from "./src/project-index/index.js";
export * as Scopes from "./src/scopes/index.js";
export * as Resources from "./src/resources/index.js";
export * as SemOracle from "./src/sem-oracle.js";
export * as SCIPTypes from "./src/scip-types.js";
export * as SCIPSymbols from "./src/scip-symbols.js";
