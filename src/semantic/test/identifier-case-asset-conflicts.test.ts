import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { describe, it } from "node:test";

import { prepareIdentifierCasePlan } from "../src/identifier-case/plan-service.js";
import { createAssetCollisionProject } from "./identifier-case-asset-helpers.js";

describe("identifier case asset conflict planning", () => {
    it("records collisions when only asset renames are configured", async () => {
        const { projectRoot, projectIndex, scriptPath } =
            await createAssetCollisionProject();

        try {
            const options: any = {
                filepath: scriptPath,
                gmlIdentifierCase: "off",
                gmlIdentifierCaseAssets: "pascal",
                gmlIdentifierCaseAcknowledgeAssetRenames: true,
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: false,
                diagnostics: []
            };

            await prepareIdentifierCasePlan(options);

            const conflicts = options.__identifierCaseConflicts ?? [];
            assert.ok(
                conflicts.length > 0,
                "expected conflicts to be recorded"
            );
            assert.ok(
                conflicts.some((conflict) => conflict.code === "collision"),
                "expected a collision conflict"
            );
            assert.notStrictEqual(
                options.__identifierCaseAssetRenamesApplied,
                true,
                "asset renames should be skipped when conflicts exist"
            );
        } finally {
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });
});
