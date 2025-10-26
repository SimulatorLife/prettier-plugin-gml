import { asArray, isNonEmptyArray } from "../shared/index.js";

// The asset rename mechanism (filesystem mutations, logging, metrics) depends
// on this policy object to decide if it should run. Keeping the rules here lets
// us exercise and extend the heuristics without touching the operational code.

const IdentifierCaseAssetRenamePolicyReason = Object.freeze({
    DRY_RUN_ENABLED: "dry-run-enabled",
    NO_RENAMES: "no-renames",
    HAS_CONFLICTS: "has-conflicts",
    MISSING_PROJECT_INDEX: "missing-project-index",
    ALREADY_APPLIED: "already-applied",
    APPLY: "apply"
});

export function evaluateIdentifierCaseAssetRenamePolicy(context = {}) {
    const {
        options = {},
        projectIndex = null,
        assetRenames = [],
        assetConflicts = []
    } = context;

    const renames = asArray(assetRenames);
    const conflicts = asArray(assetConflicts);

    const createResult = (
        reason,
        {
            shouldApply = false,
            includeRenames = false,
            includeConflicts = false
        } = {}
    ) => ({
        shouldApply,
        reason,
        renames: includeRenames ? renames : [],
        conflicts: includeConflicts ? conflicts : []
    });

    if (options?.__identifierCaseDryRun !== false) {
        return createResult(
            IdentifierCaseAssetRenamePolicyReason.DRY_RUN_ENABLED
        );
    }

    if (!isNonEmptyArray(renames)) {
        return createResult(IdentifierCaseAssetRenamePolicyReason.NO_RENAMES);
    }

    if (isNonEmptyArray(conflicts)) {
        return createResult(
            IdentifierCaseAssetRenamePolicyReason.HAS_CONFLICTS,
            { includeConflicts: true }
        );
    }

    if (!projectIndex) {
        return createResult(
            IdentifierCaseAssetRenamePolicyReason.MISSING_PROJECT_INDEX,
            { includeRenames: true }
        );
    }

    if (options?.__identifierCaseAssetRenamesApplied === true) {
        return createResult(
            IdentifierCaseAssetRenamePolicyReason.ALREADY_APPLIED,
            { includeRenames: true }
        );
    }

    return createResult(IdentifierCaseAssetRenamePolicyReason.APPLY, {
        shouldApply: true,
        includeRenames: true
    });
}

export { IdentifierCaseAssetRenamePolicyReason };
