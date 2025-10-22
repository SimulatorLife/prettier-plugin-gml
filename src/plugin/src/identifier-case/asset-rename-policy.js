import { asArray, isNonEmptyArray } from "../shared/array-utils.js";

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

function createResult(shouldApply, reason, renames, conflicts) {
    return { shouldApply, reason, renames, conflicts };
}

function evaluateIdentifierCaseAssetRenamePolicy({
    options = {},
    projectIndex = null,
    assetRenames = [],
    assetConflicts = []
} = {}) {
    if (options?.__identifierCaseDryRun !== false) {
        return createResult(
            false,
            IdentifierCaseAssetRenamePolicyReason.DRY_RUN_ENABLED,
            [],
            []
        );
    }

    const renames = asArray(assetRenames);
    if (!isNonEmptyArray(renames)) {
        return createResult(
            false,
            IdentifierCaseAssetRenamePolicyReason.NO_RENAMES,
            [],
            []
        );
    }

    const conflicts = asArray(assetConflicts);
    if (isNonEmptyArray(conflicts)) {
        return createResult(
            false,
            IdentifierCaseAssetRenamePolicyReason.HAS_CONFLICTS,
            [],
            conflicts
        );
    }

    if (!projectIndex) {
        return createResult(
            false,
            IdentifierCaseAssetRenamePolicyReason.MISSING_PROJECT_INDEX,
            renames,
            conflicts
        );
    }

    if (options?.__identifierCaseAssetRenamesApplied === true) {
        return createResult(
            false,
            IdentifierCaseAssetRenamePolicyReason.ALREADY_APPLIED,
            renames,
            conflicts
        );
    }

    return createResult(
        true,
        IdentifierCaseAssetRenamePolicyReason.APPLY,
        renames,
        conflicts
    );
}

class IdentifierCaseAssetRenamePolicy {
    evaluate(context) {
        return evaluateIdentifierCaseAssetRenamePolicy(context);
    }
}

function createIdentifierCaseAssetRenamePolicy() {
    return new IdentifierCaseAssetRenamePolicy();
}

export {
    IdentifierCaseAssetRenamePolicy,
    IdentifierCaseAssetRenamePolicyReason,
    createIdentifierCaseAssetRenamePolicy,
    evaluateIdentifierCaseAssetRenamePolicy
};
