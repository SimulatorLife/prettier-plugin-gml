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

export function applyIdentifierCasePlanSnapshot(snapshot, options) {
    if (!snapshot) {
        return;
    }

    withObjectLike(options, (object) => {
        const assignIfUnset = (optionKey, value) => {
            if (value && !object[optionKey]) {
                setIdentifierCaseOption(object, optionKey, value);
            }
        };

        const assignHiddenOption = (optionKey, value) => {
            setIdentifierCaseOption(object, optionKey, value);
            Object.defineProperty(object, optionKey, {
                value,
                writable: true,
                configurable: true,
                enumerable: false
            });
        };

        const snapshotAssignments = [
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
        ];

        for (const [snapshotKey, optionKey] of snapshotAssignments) {
            assignIfUnset(optionKey, snapshot[snapshotKey]);
        }

        assignHiddenOption("__identifierCasePlanSnapshot", snapshot);

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
            assignHiddenOption("__identifierCaseDryRun", snapshot.dryRun);
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
