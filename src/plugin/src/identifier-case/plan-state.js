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
        const truthyAssignments = [
            ["projectIndex", "__identifierCaseProjectIndex"],
            ["projectRoot", "__identifierCaseProjectRoot"],
            ["bootstrap", "__identifierCaseProjectIndexBootstrap"]
        ];

        for (const [snapshotKey, optionKey] of truthyAssignments) {
            const value = snapshot[snapshotKey];
            if (value && !object[optionKey]) {
                setIdentifierCaseOption(object, optionKey, value);
            }
        }

        setIdentifierCaseOption(
            object,
            "__identifierCasePlanSnapshot",
            snapshot
        );
        Object.defineProperty(object, "__identifierCasePlanSnapshot", {
            value: snapshot,
            writable: true,
            configurable: true,
            enumerable: false
        });

        const optionalAssignments = [
            ["renameMap", "__identifierCaseRenameMap"],
            ["renamePlan", "__identifierCaseRenamePlan"],
            ["conflicts", "__identifierCaseConflicts"],
            ["metricsReport", "__identifierCaseMetricsReport"],
            ["metrics", "__identifierCaseMetrics"],
            ["assetRenames", "__identifierCaseAssetRenames"],
            ["assetRenameResult", "__identifierCaseAssetRenameResult"]
        ];

        for (const [snapshotKey, optionKey] of optionalAssignments) {
            const value = snapshot[snapshotKey];
            if (value && !object[optionKey]) {
                setIdentifierCaseOption(object, optionKey, value);
            }
        }

        const assetRenamesApplied = snapshot.assetRenamesApplied;
        if (
            assetRenamesApplied != undefined &&
            object.__identifierCaseAssetRenamesApplied == undefined
        ) {
            setIdentifierCaseOption(
                object,
                "__identifierCaseAssetRenamesApplied",
                assetRenamesApplied
            );
        }

        if (snapshot.dryRun !== null) {
            setIdentifierCaseOption(
                object,
                "__identifierCaseDryRun",
                snapshot.dryRun
            );
            Object.defineProperty(object, "__identifierCaseDryRun", {
                value: snapshot.dryRun,
                writable: true,
                configurable: true,
                enumerable: false
            });
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
