const DEFAULT_CONTEXT_KEY = "<default>";
const contextMap = new Map();

function isObjectLike(value) {
    return value !== null && typeof value === "object";
}

/**
 * @typedef {object} IdentifierCaseDryRunPlanContext
 * @property {unknown} renamePlan
 * @property {Array<unknown>} conflicts
 * @property {unknown} dryRun
 */

/**
 * @typedef {object} IdentifierCaseDryRunReportingContext
 * @property {string | null} logFilePath
 * @property {unknown} logger
 * @property {unknown} diagnostics
 * @property {unknown} fsFacade
 * @property {unknown} now
 */

/**
 * @typedef {object} IdentifierCaseDryRunProjectContext
 * @property {unknown} projectIndex
 */

/**
 * @typedef {object} IdentifierCaseDryRunContextBundle
 * @property {IdentifierCaseDryRunPlanContext} plan
 * @property {IdentifierCaseDryRunReportingContext} reporting
 * @property {IdentifierCaseDryRunProjectContext} project
 */

function normalizeKey(filepath) {
    if (typeof filepath !== "string" || filepath.length === 0) {
        return DEFAULT_CONTEXT_KEY;
    }

    return filepath;
}

function normalizePlanContext(planCandidate) {
    const source = isObjectLike(planCandidate) ? planCandidate : {};
    const renamePlan = Object.hasOwn(source, "renamePlan")
        ? source.renamePlan
        : null;
    const conflicts = Array.isArray(source.conflicts) ? source.conflicts : [];
    const dryRun = Object.hasOwn(source, "dryRun") ? source.dryRun : true;

    return { renamePlan, conflicts, dryRun };
}

function normalizeReportingContext(reportingCandidate) {
    const source = isObjectLike(reportingCandidate) ? reportingCandidate : {};
    const {
        logFilePath = null,
        logger = null,
        diagnostics = null,
        fsFacade = null
    } = source;
    const now = Object.hasOwn(source, "now") ? (source.now ?? null) : null;

    return { logFilePath, logger, diagnostics, fsFacade, now };
}

function normalizeProjectContext(projectCandidate) {
    const source = isObjectLike(projectCandidate) ? projectCandidate : {};
    const projectIndex = Object.hasOwn(source, "projectIndex")
        ? source.projectIndex
        : null;

    return { projectIndex };
}

/**
 * Stores dry-run metadata for identifier case operations.
 *
 * @param {object} context
 * @param {string | null | undefined} [context.filepath]
 * @param {IdentifierCaseDryRunPlanContext | object | null} [context.plan]
 * @param {IdentifierCaseDryRunReportingContext | object | null} [context.reporting]
 * @param {IdentifierCaseDryRunProjectContext | object | null} [context.project]
 */
export function setIdentifierCaseDryRunContext({
    filepath = null,
    plan = null,
    reporting = null,
    project = null
} = {}) {
    const key = normalizeKey(filepath);
    contextMap.set(key, {
        plan: normalizePlanContext(plan),
        reporting: normalizeReportingContext(reporting),
        project: normalizeProjectContext(project)
    });
}

/**
 * Retrieves and removes the dry-run context associated with the supplied file.
 *
 * @param {string | null | undefined} filepath
 * @returns {IdentifierCaseDryRunContextBundle | null}
 */
export function consumeIdentifierCaseDryRunContext(filepath = null) {
    const key = normalizeKey(filepath);
    const context = contextMap.get(key) ?? null;
    contextMap.delete(key);
    return context;
}

/**
 * Retrieves the dry-run context associated with the supplied file without
 * mutating the internal registry.
 *
 * @param {string | null | undefined} filepath
 * @returns {IdentifierCaseDryRunContextBundle | null}
 */
export function peekIdentifierCaseDryRunContext(filepath = null) {
    return contextMap.get(normalizeKey(filepath)) ?? null;
}

/**
 * Removes all stored dry-run contexts.
 */
export function clearIdentifierCaseDryRunContexts() {
    contextMap.clear();
}
