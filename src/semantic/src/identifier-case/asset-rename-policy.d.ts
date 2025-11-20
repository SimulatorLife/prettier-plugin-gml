declare const IdentifierCaseAssetRenamePolicyReason: Readonly<{
    DRY_RUN_ENABLED: "dry-run-enabled";
    NO_RENAMES: "no-renames";
    HAS_CONFLICTS: "has-conflicts";
    MISSING_PROJECT_INDEX: "missing-project-index";
    ALREADY_APPLIED: "already-applied";
    APPLY: "apply";
}>;
export declare function evaluateIdentifierCaseAssetRenamePolicy(context?: {}): {
    shouldApply: boolean;
    reason: any;
    renames: any;
    conflicts: any;
};
export { IdentifierCaseAssetRenamePolicyReason };
