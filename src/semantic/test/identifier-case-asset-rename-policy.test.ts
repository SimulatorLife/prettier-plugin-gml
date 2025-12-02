import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    evaluateIdentifierCaseAssetRenamePolicy,
    IdentifierCaseAssetRenamePolicyReason
} from "../src/identifier-case/asset-rename-policy.js";

void describe("identifier case asset rename policy", () => {
    void it("requires explicit opt-in when dry run is enabled", () => {
        const result = evaluateIdentifierCaseAssetRenamePolicy({
            options: {},
            assetRenames: [{ name: "demo" }]
        });

        assert.deepStrictEqual(result, {
            shouldApply: false,
            reason: IdentifierCaseAssetRenamePolicyReason.DRY_RUN_ENABLED,
            renames: [],
            conflicts: []
        });
    });

    void it("skips when no renames are planned", () => {
        const result = evaluateIdentifierCaseAssetRenamePolicy({
            options: { __identifierCaseDryRun: false },
            assetRenames: [],
            projectIndex: {}
        });

        assert.deepStrictEqual(result, {
            shouldApply: false,
            reason: IdentifierCaseAssetRenamePolicyReason.NO_RENAMES,
            renames: [],
            conflicts: []
        });
    });

    void it("skips when conflicts are present", () => {
        const result = evaluateIdentifierCaseAssetRenamePolicy({
            options: { __identifierCaseDryRun: false },
            assetRenames: [{ name: "demo" }],
            assetConflicts: [{ resourcePath: "foo.yy" }],
            projectIndex: {}
        });

        assert.deepStrictEqual(result, {
            shouldApply: false,
            reason: IdentifierCaseAssetRenamePolicyReason.HAS_CONFLICTS,
            renames: [],
            conflicts: [{ resourcePath: "foo.yy" }]
        });
    });

    void it("skips when the project index is unavailable", () => {
        const result = evaluateIdentifierCaseAssetRenamePolicy({
            options: { __identifierCaseDryRun: false },
            assetRenames: [{ name: "demo" }]
        });

        assert.deepStrictEqual(result, {
            shouldApply: false,
            reason: IdentifierCaseAssetRenamePolicyReason.MISSING_PROJECT_INDEX,
            renames: [{ name: "demo" }],
            conflicts: []
        });
    });

    void it("skips when renames were already applied", () => {
        const result = evaluateIdentifierCaseAssetRenamePolicy({
            options: {
                __identifierCaseDryRun: false,
                __identifierCaseAssetRenamesApplied: true
            },
            assetRenames: [{ name: "demo" }],
            projectIndex: {}
        });

        assert.deepStrictEqual(result, {
            shouldApply: false,
            reason: IdentifierCaseAssetRenamePolicyReason.ALREADY_APPLIED,
            renames: [{ name: "demo" }],
            conflicts: []
        });
    });

    void it("approves the rename when all conditions are satisfied", () => {
        const result = evaluateIdentifierCaseAssetRenamePolicy({
            options: { __identifierCaseDryRun: false },
            assetRenames: [{ name: "demo" }],
            projectIndex: { id: "project" }
        });

        assert.deepStrictEqual(result, {
            shouldApply: true,
            reason: IdentifierCaseAssetRenamePolicyReason.APPLY,
            renames: [{ name: "demo" }],
            conflicts: []
        });
    });
});
