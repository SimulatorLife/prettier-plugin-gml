/**
 * Stores dry-run metadata for identifier case operations.
 *
 * @param {object} context
 * @param {string | null | undefined} [context.filepath]
 */
export declare function setIdentifierCaseDryRunContext({
    filepath,
    renamePlan,
    conflicts,
    dryRun,
    logFilePath,
    logger,
    diagnostics,
    fsFacade,
    now,
    projectIndex
}?: {
    filepath?: any;
    renamePlan?: any;
    conflicts?: any[];
    dryRun?: boolean;
    logFilePath?: any;
    logger?: any;
    diagnostics?: any;
    fsFacade?: any;
    now?: any;
    projectIndex?: any;
}): void;
/**
 * Retrieves and removes the dry-run context associated with the supplied file.
 *
 * @param {string | null | undefined} filepath
 * @returns {object | null}
 */
export declare function consumeIdentifierCaseDryRunContext(filepath?: any): any;
/**
 * Retrieves the dry-run context associated with the supplied file without
 * mutating the internal registry.
 *
 * @param {string | null | undefined} filepath
 * @returns {object | null}
 */
export declare function peekIdentifierCaseDryRunContext(filepath?: any): any;
/**
 * Removes all stored dry-run contexts.
 */
export declare function clearIdentifierCaseDryRunContexts(): void;
