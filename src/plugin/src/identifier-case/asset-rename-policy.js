import { asArray, isNonEmptyArray } from "../../../shared/array-utils.js";

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

class IdentifierCaseAssetRenamePolicy {
    evaluate(context = {}) {
        const {
            options = {},
            projectIndex = null,
            assetRenames = [],
            assetConflicts = []
        } = context;

        if (options?.__identifierCaseDryRun !== false) {
            return {
                shouldApply: false,
                reason: IdentifierCaseAssetRenamePolicyReason.DRY_RUN_ENABLED,
                renames: [],
                conflicts: []
            };
        }

        const renames = asArray(assetRenames);
        if (!isNonEmptyArray(renames)) {
            return {
                shouldApply: false,
                reason: IdentifierCaseAssetRenamePolicyReason.NO_RENAMES,
                renames: [],
                conflicts: []
            };
        }

        const conflicts = asArray(assetConflicts);
        if (isNonEmptyArray(conflicts)) {
            return {
                shouldApply: false,
                reason: IdentifierCaseAssetRenamePolicyReason.HAS_CONFLICTS,
                renames: [],
                conflicts
            };
        }

        if (!projectIndex) {
            return {
                shouldApply: false,
                reason: IdentifierCaseAssetRenamePolicyReason.MISSING_PROJECT_INDEX,
                renames,
                conflicts
            };
        }

        if (options?.__identifierCaseAssetRenamesApplied === true) {
            return {
                shouldApply: false,
                reason: IdentifierCaseAssetRenamePolicyReason.ALREADY_APPLIED,
                renames,
                conflicts
            };
        }

        return {
            shouldApply: true,
            reason: IdentifierCaseAssetRenamePolicyReason.APPLY,
            renames,
            conflicts
        };
    }
}

function createIdentifierCaseAssetRenamePolicy() {
    return new IdentifierCaseAssetRenamePolicy();
}

export {
    IdentifierCaseAssetRenamePolicy,
    IdentifierCaseAssetRenamePolicyReason,
    createIdentifierCaseAssetRenamePolicy
};
