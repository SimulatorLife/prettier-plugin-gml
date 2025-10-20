import { buildLocationKey } from "../../../shared/location-keys.js";
import { withObjectLike } from "../../../shared/object-utils.js";
import { isMapLike } from "../../../shared/utils/capability-probes.js";
import { setIdentifierCaseOption } from "./option-store.js";

function buildRenameKey(_scopeId, location) {
    const locationKey = buildLocationKey(location);
    if (!locationKey) {
        return null;
    }

    return locationKey;
}

/**
 * Resolve the rename target for a node when an identifier case plan has been
 * generated. The helper centralizes the guard rails shared by the printer and
 * local planning pipeline so they stay in sync about when a rename can run.
 *
 * - Missing node metadata or absent rename maps short-circuit with `null`.
 * - Dry-run executions and plan snapshots marked as dry-run are ignored to
 *   avoid mutating emitted output.
 *
 * @param {import("../../../shared/ast.js").GameMakerAstNode | null} node
 *        AST node whose identifier may be renamed.
 * @param {Record<string, unknown> | null} options
 *        Active plugin options possibly containing rename plan state.
 * @returns {string | null}
 */
export function getIdentifierCaseRenameForNode(node, options) {
    if (!node || !options) {
        return null;
    }

    const renameMap = options.__identifierCaseRenameMap;
    if (!isMapLike(renameMap)) {
        return null;
    }

    const key = buildRenameKey(node.scopeId ?? null, node.start ?? null);
    if (!key) {
        return null;
    }

    const renameTarget = renameMap.get(key) ?? null;
    if (!renameTarget) {
        return null;
    }

    const planSnapshot = options.__identifierCasePlanSnapshot ?? null;

    if (options.__identifierCaseDryRun === true) {
        return null;
    }

    if (planSnapshot?.dryRun === true) {
        return null;
    }

    return renameTarget;
}

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
export function captureIdentifierCasePlanSnapshot(options) {
    return withObjectLike(
        options,
        (object) => ({
            projectIndex: object.__identifierCaseProjectIndex ?? null,
            projectRoot: object.__identifierCaseProjectRoot ?? null,
            bootstrap: object.__identifierCaseProjectIndexBootstrap ?? null,
            renameMap: object.__identifierCaseRenameMap ?? null,
            renamePlan: object.__identifierCaseRenamePlan ?? null,
            conflicts: object.__identifierCaseConflicts ?? null,
            metricsReport: object.__identifierCaseMetricsReport ?? null,
            metrics: object.__identifierCaseMetrics ?? null,
            assetRenames: object.__identifierCaseAssetRenames ?? null,
            assetRenameResult: object.__identifierCaseAssetRenameResult ?? null,
            assetRenamesApplied:
                object.__identifierCaseAssetRenamesApplied ?? null,
            dryRun:
                object.__identifierCaseDryRun === undefined
                    ? null
                    : object.__identifierCaseDryRun,
            planGenerated:
                object.__identifierCasePlanGeneratedInternally === true
        }),
        null
    );
}

const SNAPSHOT_OPTION_ENTRIES = Object.freeze([
    ["projectIndex", "__identifierCaseProjectIndex"],
    ["projectRoot", "__identifierCaseProjectRoot"],
    ["bootstrap", "__identifierCaseProjectIndexBootstrap"],
    ["renameMap", "__identifierCaseRenameMap"],
    ["renamePlan", "__identifierCaseRenamePlan"],
    ["conflicts", "__identifierCaseConflicts"],
    ["metricsReport", "__identifierCaseMetricsReport"],
    ["metrics", "__identifierCaseMetrics"],
    ["assetRenames", "__identifierCaseAssetRenames"],
    ["assetRenameResult", "__identifierCaseAssetRenameResult"]
]);

function defineHiddenOption(object, optionKey, value) {
    setIdentifierCaseOption(object, optionKey, value);
    Object.defineProperty(object, optionKey, {
        value,
        writable: true,
        configurable: true,
        enumerable: false
    });
}

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
export function applyIdentifierCasePlanSnapshot(snapshot, options) {
    if (!snapshot) {
        return;
    }

    withObjectLike(options, (object) => {
        for (const [snapshotKey, optionKey] of SNAPSHOT_OPTION_ENTRIES) {
            const value = snapshot[snapshotKey];
            if (value && !object[optionKey]) {
                setIdentifierCaseOption(object, optionKey, value);
            }
        }

        defineHiddenOption(object, "__identifierCasePlanSnapshot", snapshot);

        if (
            snapshot.assetRenamesApplied != undefined &&
            object.__identifierCaseAssetRenamesApplied == undefined
        ) {
            setIdentifierCaseOption(
                object,
                "__identifierCaseAssetRenamesApplied",
                snapshot.assetRenamesApplied
            );
        }

        if (snapshot.dryRun !== null) {
            defineHiddenOption(
                object,
                "__identifierCaseDryRun",
                snapshot.dryRun
            );
        }

        if (snapshot.planGenerated) {
            setIdentifierCaseOption(
                object,
                "__identifierCasePlanGeneratedInternally",
                true
            );
        }
    });
}

export { buildRenameKey };
