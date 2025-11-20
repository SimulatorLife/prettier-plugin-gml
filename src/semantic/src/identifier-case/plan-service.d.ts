/**
 * Inject a custom preparation provider so embedders can override how the
 * identifier-case plan bootstraps itself. Passing `null` or a non-function will
 * surface a descriptive `TypeError` via the shared assertion helpers.
 *
 * @param {IdentifierCasePlanPreparationProvider} provider Factory returning the
 *        preparation service to use for subsequent calls.
 */
export declare function registerIdentifierCasePlanPreparationProvider(provider: any): void;
/**
 * Register a lookup provider responsible for mapping AST nodes to their case
 * corrections. Consumers typically install this when they need project-aware
 * rename logic during tests or bespoke integrations.
 *
 * @param {IdentifierCaseRenameLookupProvider} provider Function returning the
 *        lookup service implementation.
 */
export declare function registerIdentifierCaseRenameLookupProvider(provider: any): void;
/**
 * Register snapshot orchestration hooks so hosts can persist and restore
 * identifier-case state between formatter runs. Used primarily by long-lived
 * processes that cache rename plans across files.
 *
 * @param {IdentifierCasePlanSnapshotCaptureProvider} provider Factory
 *        returning the snapshot capture service implementation.
 */
export declare function registerIdentifierCasePlanSnapshotCaptureProvider(provider: any): void;
/**
 * Register snapshot rehydration hooks so hosts can restore identifier-case
 * state between formatter runs. Used primarily by long-lived processes that
 * hydrate rename plans from disk.
 *
 * @param {IdentifierCasePlanSnapshotApplyProvider} provider Factory returning
 *        the snapshot apply service implementation.
 */
export declare function registerIdentifierCasePlanSnapshotApplyProvider(provider: any): void;
/**
 * Restore the default provider trio. Useful for tests that temporarily swap in
 * bespoke collaborators and need a predictable baseline afterwards.
 */
export declare function resetIdentifierCasePlanServiceProvider(): void;
/**
 * Resolve the active preparation service.
 *
 * @returns {IdentifierCasePlanPreparationService}
 */
export declare function resolveIdentifierCasePlanPreparationService(): any;
/**
 * Resolve the registered rename lookup service.
 *
 * @returns {IdentifierCaseRenameLookupService}
 */
export declare function resolveIdentifierCaseRenameLookupService(): any;
/**
 * Resolve the active snapshot collaborators shared by the capture/apply views.
 *
 * @returns {IdentifierCasePlanSnapshotCollaborators}
 */
export declare function resolveIdentifierCasePlanSnapshotCaptureService(): any;
export declare function resolveIdentifierCasePlanSnapshotApplyService(): any;
/**
 * Prepare the identifier-case plan using the active preparation service.
 *
 * @param {object | null | undefined} options Caller-provided configuration.
 * @returns {Promise<void>}
 */
export declare function prepareIdentifierCasePlan(options: any): any;
/**
 * Look up the rename to apply for a given AST node using the registered
 * lookup service.
 *
 * @param {import("../dependencies.js").GameMakerAstNode | null} node
 * @param {Record<string, unknown> | null | undefined} options
 * @returns {string | null}
 */
export declare function getIdentifierCaseRenameForNode(node: any, options: any): any;
/**
 * Capture the identifier-case plan snapshot for later reuse.
 *
 * @param {unknown} options Snapshot configuration passed through to the
 *        provider.
 * @returns {ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>}
 */
export declare function captureIdentifierCasePlanSnapshot(options: any): any;
/**
 * Rehydrate identifier-case plan state from a previously captured snapshot.
 *
 * @param {ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>} snapshot
 * @param {Record<string, unknown> | null | undefined} options
 * @returns {void}
 */
export declare function applyIdentifierCasePlanSnapshot(snapshot: any, options: any): any;
