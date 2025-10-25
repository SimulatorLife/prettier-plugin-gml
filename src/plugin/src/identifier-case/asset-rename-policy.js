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

    let reason;
    if (options?.__identifierCaseDryRun !== false) {
        reason = IdentifierCaseAssetRenamePolicyReason.DRY_RUN_ENABLED;
    } else if (!isNonEmptyArray(renames)) {
        reason = IdentifierCaseAssetRenamePolicyReason.NO_RENAMES;
    } else if (isNonEmptyArray(conflicts)) {
        reason = IdentifierCaseAssetRenamePolicyReason.HAS_CONFLICTS;
    } else if (!projectIndex) {
        reason = IdentifierCaseAssetRenamePolicyReason.MISSING_PROJECT_INDEX;
    } else if (options?.__identifierCaseAssetRenamesApplied === true) {
        reason = IdentifierCaseAssetRenamePolicyReason.ALREADY_APPLIED;
    } else {
        reason = IdentifierCaseAssetRenamePolicyReason.APPLY;
    }

    const shouldApply = reason === IdentifierCaseAssetRenamePolicyReason.APPLY;

    const includeRenames =
        reason === IdentifierCaseAssetRenamePolicyReason.APPLY ||
        reason ===
            IdentifierCaseAssetRenamePolicyReason.MISSING_PROJECT_INDEX ||
        reason === IdentifierCaseAssetRenamePolicyReason.ALREADY_APPLIED;
    const includeConflicts =
        reason === IdentifierCaseAssetRenamePolicyReason.HAS_CONFLICTS;

    return {
        shouldApply,
        reason,
        renames: includeRenames ? renames : [],
        conflicts: includeConflicts ? conflicts : []
    };
}

export { IdentifierCaseAssetRenamePolicyReason };
