import { Core } from "@gml-modules/core";
import type { MutableGameMakerAstNode } from "@gml-modules/core";

import { setIdentifierCaseOption } from "./option-store.js";
import type { DebuggableMap } from "./types.js";
import { getDebugId } from "./types.js";

function buildRenameKey(_scopeId, location) {
    // Accept numeric start indices as well as location objects. Some AST
    // transformations normalize node locations to raw indices while the
    // planner uses full location objects; normalize numeric inputs so the
    // resulting location key encoding is consistent between planning and
    // printing.
    const normalizedLocation =
        typeof location === "number" ? { index: location } : location;

    const locationKey = Core.buildLocationKey(normalizedLocation);
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
 * @param node AST node whose identifier may be renamed.
 * @param options Active plugin options possibly containing rename plan state.
 * @returns The planned identifier rename when available.
 */
export function getIdentifierCaseRenameForNode(
    node: MutableGameMakerAstNode | null,
    options: any | null
) {
    if (!node || !options) {
        return null;
    }

    const renameMap = options.__identifierCaseRenameMap;
    if (!Core.isMapLike(renameMap)) {
        try {
            console.debug(
                `[DBG] getIdentifierCaseRenameForNode: no renameMap present for filepath=${options?.filepath ?? null}`
            );
        } catch {
            /* ignore */
        }
        return null;
    }

    const key = buildRenameKey(node.scopeId ?? null, node.start ?? null);
    try {
        console.debug(
            `[DBG] getIdentifierCaseRenameForNode: lookup key=${String(key)} renameMapSize=${typeof renameMap.size === "number" ? renameMap.size : "n/a"}`
        );
    } catch {
        /* ignore */
    }
    if (!key) {
        return null;
    }

    const renameTarget = renameMap.get(key) ?? null;
    try {
        console.debug(
            `[DBG] getIdentifierCaseRenameForNode: renameTargetPresent=${Boolean(renameTarget)}`
        );
    } catch {
        /* ignore */
    }
    if (!renameTarget) {
        try {
            // If the lookup failed, emit a few example keys from the map to
            // help diagnose mismatched key encoding (scopeId/start vs the
            // map keys used during planning).
            if (typeof renameMap.has === "function" && !renameMap.has(key)) {
                const sample = [];
                let i = 0;
                for (const k of renameMap.keys()) {
                    sample.push(String(k));
                    i += 1;
                    if (i >= 3) break;
                }
                // Also attempt a file-qualified lookup as some planning paths
                // may persist keys that include the file path. Try the
                // file-qualified location key before emitting the diagnostic
                // sample so we can detect which encoding is present.
                try {
                    const loc =
                        typeof node.start === "number"
                            ? { index: node.start }
                            : node.start;
                    const fileKey = Core.buildFileLocationKey(
                        options?.filepath ?? null,
                        loc
                    );
                    if (
                        fileKey &&
                        typeof renameMap.has === "function" &&
                        renameMap.has(fileKey)
                    ) {
                        console.debug(
                            `[DBG] getIdentifierCaseRenameForNode: fallback-fileKey-hit fileKey=${String(fileKey)} renameMapId=${getDebugId(renameMap)}`
                        );
                        return renameMap.get(fileKey) ?? null;
                    }
                } catch {
                    /* ignore */
                }

                console.debug(
                    `[DBG] getIdentifierCaseRenameForNode: lookup-miss key=${String(key)} samples=${JSON.stringify(sample)}`
                );
            }
        } catch {
            /* ignore */
        }
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
    return Core.withObjectLike(
        options,
        (object) => {
            const snapshot = {
                projectIndex: object.__identifierCaseProjectIndex ?? null,
                projectRoot: object.__identifierCaseProjectRoot ?? null,
                bootstrap: object.__identifierCaseProjectIndexBootstrap ?? null,
                renameMap: object.__identifierCaseRenameMap ?? null,
                renamePlan: object.__identifierCaseRenamePlan ?? null,
                conflicts: object.__identifierCaseConflicts ?? null,
                metricsReport: object.__identifierCaseMetricsReport ?? null,
                metrics: object.__identifierCaseMetrics ?? null,
                assetRenames: object.__identifierCaseAssetRenames ?? null,
                assetRenameResult:
                    object.__identifierCaseAssetRenameResult ?? null,
                assetRenamesApplied:
                    object.__identifierCaseAssetRenamesApplied ?? null,
                dryRun:
                    object.__identifierCaseDryRun === undefined
                        ? null
                        : object.__identifierCaseDryRun,
                planGenerated:
                    object.__identifierCasePlanGeneratedInternally === true
            };

            try {
                // If a renameMap exists, emit a small sample of keys to help
                // diagnose mismatched key encodings between planning and
                // printing. Keep messages defensive so tests don't crash on
                // unexpected shapes.
                if (Core.isMapLike(snapshot.renameMap)) {
                    const samples = [];
                    let i = 0;
                    for (const k of snapshot.renameMap.keys()) {
                        let v = null;
                        try {
                            v = snapshot.renameMap.get(k);
                        } catch {
                            /* ignore */
                        }
                        samples.push(`${String(k)}=>${String(v)}`);
                        i += 1;
                        if (i >= 5) break;
                    }
                    console.debug(
                        `[DBG] captureIdentifierCasePlanSnapshot: renameMap=true renameMapId=${getDebugId(snapshot?.renameMap)} size=${snapshot.renameMap.size} samples=${JSON.stringify(samples)} planGenerated=${Boolean(snapshot.planGenerated)}`
                    );
                } else {
                    console.debug(
                        `[DBG] captureIdentifierCasePlanSnapshot: renameMap=${Boolean(snapshot.renameMap)} renameMapId=${getDebugId(snapshot?.renameMap)} planGenerated=${Boolean(snapshot.planGenerated)}`
                    );
                }
            } catch {
                /* ignore */
            }

            return snapshot;
        },
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

    // Debug: log when snapshot application runs to help trace why write-mode
    // renames may not be applied during printing. Remove once triage is
    // complete.
    try {
        // Emit this diagnostic via the debug channel so it doesn't pollute
        // stderr during test runs while remaining available for local
        // debugging when users enable debug logging.
        console.debug(
            `[DBG] applyIdentifierCasePlanSnapshot called: planGenerated=${Boolean(snapshot.planGenerated)} renameMap=${Boolean(snapshot.renameMap)}`
        );
    } catch {
        /* ignore */
    }

    Core.withObjectLike(
        options,
        (object) => {
            for (const [snapshotKey, optionKey] of SNAPSHOT_OPTION_ENTRIES) {
                const value = snapshot[snapshotKey];
                // Special-case the renameMap: avoid applying an empty map as that
                // would overwrite a previously-captured non-empty plan. Only write
                // the renameMap when it is map-like and contains at least one
                // entry. Other snapshot entries follow the existing semantics.
                if (snapshotKey === "renameMap") {
                    const isMap = Core.isMapLike(value);
                    const size =
                        isMap && typeof value.size === "number"
                            ? value.size
                            : 0;
                    if (isMap && size > 0 && !object[optionKey]) {
                        setIdentifierCaseOption(object, optionKey, value);
                        try {
                            try {
                                // Log a small sample of map keys to help diagnose
                                // mismatches between planner-generated keys and the
                                // keys used by printer lookups.
                                const samples = [];
                                let c = 0;
                                for (const k of value.keys()) {
                                    samples.push(String(k));
                                    c += 1;
                                    if (c >= 3) break;
                                }
                                console.debug(
                                    `[DBG] applyIdentifierCasePlanSnapshot: set ${optionKey} id=${getDebugId(value as DebuggableMap)} size=${String(size)} samples=${JSON.stringify(samples)} filepath=${object?.filepath ?? null}`
                                );
                            } catch {
                                /* ignore */
                            }
                        } catch {
                            /* ignore */
                        }
                    }
                    // After writing the option, emit an identity check to confirm
                    // whether the snapshot's map instance is the same object that
                    // now lives on the options bag. This helps detect cases where
                    // the map may have been cloned, cleared, or replaced between
                    // capture and apply.
                    try {
                        const current = object[optionKey];
                        const same = current === value;
                        const curSize = Core.isMapLike(current)
                            ? current.size
                            : null;
                        console.debug(
                            `[DBG] applyIdentifierCasePlanSnapshot: post-write identity optionKey=${optionKey} snapshotId=${getDebugId(value as DebuggableMap)} currentId=${getDebugId(current as DebuggableMap)} same=${String(same)} currentSize=${String(curSize)} filepath=${object?.filepath ?? null}`
                        );
                    } catch {
                        /* ignore */
                    }
                    continue;
                }

                if (value && !object[optionKey]) {
                    setIdentifierCaseOption(object, optionKey, value);
                }
            }

            defineHiddenOption(
                object,
                "__identifierCasePlanSnapshot",
                snapshot
            );

            if (
                snapshot.assetRenamesApplied !== undefined &&
                object.__identifierCaseAssetRenamesApplied === undefined
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
        },
        null
    );
}

export { buildRenameKey };
