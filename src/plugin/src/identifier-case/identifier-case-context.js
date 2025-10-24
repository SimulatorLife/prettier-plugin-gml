const DEFAULT_CONTEXT_KEY = "<default>";
const contextMap = new Map();

/**
 * Normalizes optional file path inputs into a consistent map key.
 *
 * @param {string | null | undefined} filepath
 * @returns {string}
 */
function normalizeKey(filepath) {
    if (typeof filepath !== "string" || filepath.length === 0) {
        return DEFAULT_CONTEXT_KEY;
    }

    return filepath;
}

/**
 * Stores dry-run metadata for identifier case operations.
 *
 * @param {object} context
 * @param {string | null | undefined} [context.filepath]
 */
export function setIdentifierCaseDryRunContext({
    filepath = null,
    renamePlan = null,
    conflicts = [],
    dryRun = true,
    logFilePath = null,
    logger = null,
    diagnostics = null,
    fsFacade = null,
    now = null,
    projectIndex = null
} = {}) {
    const key = normalizeKey(filepath);
    contextMap.set(key, {
        renamePlan,
        conflicts,
        dryRun,
        logFilePath,
        logger,
        diagnostics,
        fsFacade,
        now,
        projectIndex
    });
}

/**
 * Retrieves and removes the dry-run context associated with the supplied file.
 *
 * @param {string | null | undefined} filepath
 * @returns {object | null}
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
 * @returns {object | null}
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
