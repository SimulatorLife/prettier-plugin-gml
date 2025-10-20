import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    createIdentifierCaseAssetRenamePolicy,
    IdentifierCaseAssetRenamePolicyReason
} from "../src/identifier-case/asset-rename-policy.js";

function evaluate(context) {
    const policy = createIdentifierCaseAssetRenamePolicy();
    return policy.evaluate(context);
}

describe("identifier case asset rename policy", () => {
    it("requires explicit opt-in when dry run is enabled", () => {
        const result = evaluate({
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

    it("skips when no renames are planned", () => {
        const result = evaluate({
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

    it("skips when conflicts are present", () => {
        const result = evaluate({
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

    it("skips when the project index is unavailable", () => {
        const result = evaluate({
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

    it("skips when renames were already applied", () => {
        const result = evaluate({
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

    it("approves the rename when all conditions are satisfied", () => {
        const result = evaluate({
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
