const DEFAULT_CONTEXT_KEY = "<default>";
const contextMap = new Map();

/**
 * Normalizes optional file path inputs into a consistent map key.
 *
 * @param {string | null | undefined} filePath
 * @returns {string}
 */
function normalizeKey(filepath) {
    if (typeof filepath !== "string" || filepath.length === 0) {
        return DEFAULT_CONTEXT_KEY;
    }

    return filepath;
}

/**
 * Resolve the normalized map key and associated context entry. Consolidates
 * the repeated `has`/`get` guards used when consuming or peeking at stored
 * metadata so each call site stays consistent when converting missing entries
 * to `null` and optionally removing consumed records.
 *
 * @param {string | null | undefined} filepath
 * @param {{ remove?: boolean }} [options]
 * @returns {{ key: string, context: object | null }}
 */
function accessContextEntry(filepath, { remove = false } = {}) {
    const key = normalizeKey(filepath);
    const hasEntry = contextMap.has(key);
    const context = hasEntry ? contextMap.get(key) : null;

    if (remove && hasEntry) {
        contextMap.delete(key);
    }

    return { key, context };
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
    const { key } = accessContextEntry(filepath);
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
    const { context } = accessContextEntry(filepath, { remove: true });
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
    const { context } = accessContextEntry(filepath);
    return context;
}

/**
 * Removes all stored dry-run contexts.
 */
export function clearIdentifierCaseDryRunContexts() {
    contextMap.clear();
}
