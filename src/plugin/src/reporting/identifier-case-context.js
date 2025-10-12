const contextMap = new Map();

function normaliseKey(filepath) {
    if (typeof filepath !== "string" || filepath.length === 0) {
        return "<default>";
    }

    return filepath;
}

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
    const key = normaliseKey(filepath);
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

export function consumeIdentifierCaseDryRunContext(filepath = null) {
    const key = normaliseKey(filepath);
    if (!contextMap.has(key)) {
        return null;
    }

    const context = contextMap.get(key);
    contextMap.delete(key);
    return context;
}

export function peekIdentifierCaseDryRunContext(filepath = null) {
    const key = normaliseKey(filepath);
    if (!contextMap.has(key)) {
        return null;
    }

    return contextMap.get(key);
}

export function clearIdentifierCaseDryRunContexts() {
    contextMap.clear();
}
