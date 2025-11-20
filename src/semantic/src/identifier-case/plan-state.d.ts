declare function buildRenameKey(_scopeId: any, location: any): any;
/**
 * Resolve the rename target for a node when an identifier case plan has been
 * generated. The helper centralizes the guard rails shared by the printer and
 * local planning pipeline so they stay in sync about when a rename can run.
 *
 * - Missing node metadata or absent rename maps short-circuit with `null`.
 * - Dry-run executions and plan snapshots marked as dry-run are ignored to
 *   avoid mutating emitted output.
 *
 * @param {import("../dependencies.js").GameMakerAstNode | null} node
 *        AST node whose identifier may be renamed.
 * @param {Record<string, unknown> | null} options
 *        Active plugin options possibly containing rename plan state.
 * @returns {string | null}
 */
export declare function getIdentifierCaseRenameForNode(
    node: any,
    options: any
): any;
/**
 * Capture a shallow snapshot of the identifier case plan metadata stored on
 * the options bag. Callers can persist the result to survive across formatter
 * invocations (for example when formatting multiple files) and later apply it
 * with {@link applyIdentifierCasePlanSnapshot}.
 *
 * @param {unknown} options Options object carrying identifier case metadata.
 * @returns {null | {
 *     projectIndex: unknown;
 *     projectRoot: unknown;
 *     bootstrap: unknown;
 *     renameMap: unknown;
 *     renamePlan: unknown;
 *     conflicts: unknown;
 *     metricsReport: unknown;
 *     metrics: unknown;
 *     assetRenames: unknown;
 *     assetRenameResult: unknown;
 *     assetRenamesApplied: unknown;
 *     dryRun: boolean | null;
 *     planGenerated: boolean;
 * }}
 */
export declare function captureIdentifierCasePlanSnapshot(options: any): any;
/**
 * Rehydrate the identifier case planning metadata onto an options bag using a
 * snapshot captured earlier. Values are only written when the destination does
 * not already define the target option to respect run-time overrides. Hidden
 * options (such as the dry-run flag) are defined as non-enumerable properties
 * so they do not leak into user-facing configuration dumps.
 *
 * @param {ReturnType<typeof captureIdentifierCasePlanSnapshot>} snapshot
 * @param {Record<string, unknown> | null | undefined} options
 * @returns {void}
 */
export declare function applyIdentifierCasePlanSnapshot(
    snapshot: any,
    options: any
): void;
export { buildRenameKey };
